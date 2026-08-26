// The two halves of the document layer that have to be right without anyone
// checking: what survives a save (because it then runs in the next reader's
// browser), and what an uploaded slate turns into (because nobody is going to
// proofread twenty-three pages of it).

import { describe, it, expect } from "vitest";
import { sanitizeDocHtml, textToDocHtml } from "@/lib/doc-format";

describe("sanitizing what gets saved", () => {
  it("keeps ordinary formatting intact", () => {
    const html = "<h2>Slate</h2><p><strong>P:</strong> 4.4.Forty <em>Media</em></p><ul><li>One</li></ul>";
    expect(sanitizeDocHtml(html)).toBe(html);
  });

  it("removes a script and everything inside it", () => {
    const out = sanitizeDocHtml('<p>Before</p><script>fetch("/api/admin")</script><p>After</p>');
    expect(out).toBe("<p>Before</p><p>After</p>");
    expect(out).not.toContain("fetch");
  });

  it("strips event handlers rather than trusting the tag", () => {
    const out = sanitizeDocHtml('<p onclick="steal()">Text</p><div onmouseover="x()">More</div>');
    expect(out).toBe("<p>Text</p><div>More</div>");
  });

  it("drops a javascript: link but keeps a real one", () => {
    expect(sanitizeDocHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeDocHtml('<a href="https://4.4forty.com">x</a>')).toBe('<a href="https://4.4forty.com">x</a>');
    expect(sanitizeDocHtml('<a href="/projects/foul-play">x</a>')).toBe('<a href="/projects/foul-play">x</a>');
    expect(sanitizeDocHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>')).toBe("<a>x</a>");
  });

  it("removes embedded frames and forms outright", () => {
    expect(sanitizeDocHtml('<iframe src="//evil"></iframe><p>ok</p>')).toBe("<p>ok</p>");
    expect(sanitizeDocHtml('<form action="/x"><input></form><p>ok</p>')).toBe("<p>ok</p>");
  });

  it("leaves the text of a stripped tag alone", () => {
    // Removing formatting must not remove someone's writing with it.
    expect(sanitizeDocHtml("<marquee>Keep this sentence</marquee>")).toBe("Keep this sentence");
  });
});

describe("turning an uploaded slate into a document", () => {
  it("reads a shouted line as a heading and a labelled line as a label", () => {
    const html = textToDocHtml("ROOKIE DINNER\nA rookie and a legend share a meal.\nSTATUS: Casting.");
    expect(html).toContain("<h3>ROOKIE DINNER</h3>");
    expect(html).toContain("<strong>STATUS:</strong> Casting.");
  });

  it("promotes a heading that introduces other headings", () => {
    const html = textToDocHtml("PROJECTS IN PRODUCTION\nROOKIE DINNER\nA rookie and a legend.");
    expect(html).toContain("<h2>PROJECTS IN PRODUCTION</h2>");
    expect(html).toContain("<h3>ROOKIE DINNER</h3>");
  });

  it("rejoins a paragraph the page wrapped, without swallowing the next entry", () => {
    const html = textToDocHtml(
      [
        "Danny is working with Nick in the soccer space and planning for the World",
        "Cup, with formats in sports.",
        "Podcast",
        "Maxey Drill",
      ].join("\n"),
    );
    expect(html).toContain("<p>Danny is working with Nick in the soccer space and planning for the World Cup, with formats in sports.</p>");
    // Short lines were meant to end where they end.
    expect(html).toContain("<p>Podcast</p>");
    expect(html).toContain("<p>Maxey Drill</p>");
  });

  it("treats a line after a trailing comma as a continuation, capitals or not", () => {
    // A credit list wrapping onto "JAKM3N" is the rest of the credit, not a
    // new section of the slate.
    const html = textToDocHtml("P: 4.4.Forty Media, Bad Woods, Grandma's House Entertainment,\nJAKM3N\nS: TBS");
    expect(html).toContain("Grandma&#039;s House Entertainment, JAKM3N".replace("&#039;", "'"));
    expect(html).not.toContain("<h3>JAKM3N</h3>");
    expect(html).toContain("<strong>S:</strong> TBS");
  });

  it("escapes text that looks like markup", () => {
    const html = textToDocHtml("Use the outline panel (View > Show outline)\n<script>x</script>");
    expect(html).toContain("View &gt; Show outline");
    expect(html).not.toContain("<script>");
  });

  it("survives an empty or whitespace-only document", () => {
    expect(textToDocHtml("")).toBe("");
    expect(textToDocHtml("\n\n   \n")).toBe("");
  });
});
