// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearDirectoryFilters } from "@/lib/directory-params";

const navigation = vi.hoisted(() => ({ query: "", pathname: "/talent", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));
import { useDirectoryQuery } from "@/components/hooks/use-directory-query";
let control: ReturnType<typeof useDirectoryQuery>;
let root: Root;
let container: HTMLDivElement;
function Harness() { const current = useDirectoryQuery(); useLayoutEffect(() => { control = current; }); return createElement("input", { value: current.q, readOnly: true }); }
function commit(query: string) { navigation.query = query; act(() => root.render(createElement(Harness))); }
beforeEach(() => {
  vi.useFakeTimers(); navigation.query = ""; navigation.push.mockReset(); navigation.replace.mockReset();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  act(() => root.render(createElement(Harness)));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

describe("directory interaction state", () => {
  it("combines a filter click with pending search text without a late overwrite", () => {
    act(() => control.onSearch("basketball"));
    act(() => control.update((p) => p.set("platform", "youtube")));
    expect(navigation.push).toHaveBeenLastCalledWith("/talent?q=basketball&platform=youtube", { scroll: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("preserves rapid filter changes even when an earlier response arrives", () => {
    act(() => control.update((p) => p.set("platform", "youtube")));
    act(() => control.update((p) => p.set("status", "priority")));
    commit("platform=youtube");
    act(() => control.update((p) => p.set("min", "300000")));
    expect(navigation.push).toHaveBeenLastCalledWith("/talent?platform=youtube&status=priority&min=300000", { scroll: false });
  });
  it("does not replace newer typing with an earlier search response", () => {
    act(() => control.onSearch("ju")); act(() => vi.advanceTimersByTime(300));
    act(() => control.onSearch("juju")); commit("q=ju");
    expect(control.q).toBe("juju");
    act(() => vi.advanceTimersByTime(300));
    expect(navigation.replace).toHaveBeenLastCalledWith("/talent?q=juju", { scroll: false });
  });
  it("clears search and restores it correctly on Back navigation", () => {
    commit("q=basketball&status=priority&sort=audience&view=cards");
    act(() => control.update(clearDirectoryFilters));
    expect(control.q).toBe("");
    commit("sort=audience&view=cards");
    commit("q=basketball&status=priority&sort=audience&view=cards");
    expect(control.q).toBe("basketball");
    expect(control.searchParams.get("status")).toBe("priority");
  });
  it("cancels pending typing when Back changes the URL", () => {
    commit("q=old"); act(() => control.onSearch("unfinished")); commit("q=previous");
    act(() => vi.advanceTimersByTime(1000));
    expect(control.q).toBe("previous"); expect(navigation.replace).not.toHaveBeenCalled();
  });
});
