import { describe, it, expect } from "vitest";
import { normalizeTalentRows, parseCount, parsePercent } from "@/lib/talent-import";

describe("count and percent parsing", () => {
  it("reads abbreviated and formatted counts", () => {
    expect(parseCount("1.61M")).toBe(1_610_000);
    expect(parseCount("646.95K")).toBe(646_950);
    expect(parseCount("2.80M")).toBe(2_800_000);
    expect(parseCount("1,610,000")).toBe(1_610_000);
    expect(parseCount("890")).toBe(890);
    expect(parseCount("—")).toBeUndefined();
    expect(parseCount("")).toBeUndefined();
    expect(parseCount("n/a")).toBeUndefined();
  });

  it("reads engagement rates as percentages", () => {
    expect(parsePercent("4.47%")).toBe(4.47);
    expect(parsePercent("9.98%")).toBe(9.98);
    expect(parsePercent("0.0447")).toBe(4.47); // bare fraction
    expect(parsePercent("-")).toBeUndefined();
  });
});

describe("talent spreadsheet normalization", () => {
  it("parses a wide CreatorIQ-style export with its own column names", () => {
    // Header names, capitalization, and count formats as a creator tool exports them.
    const rows = [
      {
        "Creator Name": "Agent00",
        "Bio": "Prominent content creator, streamer, and entertainer.",
        "Location": "Los Angeles",
        "Content Categories": "Creator; Streamer",
        "IG Handle": "@agent00",
        "IG Followers": "1.70M",
        "IG Eng. Rate": "4.52%",
        "TikTok Handle": "agent00",
        "TikTok Followers": "2.80M",
        "TikTok Eng. Rate": "9.98%",
      },
    ];
    const [talent] = normalizeTalentRows(rows);
    expect(talent.name).toBe("Agent00");
    expect(talent.basedIn).toBe("Los Angeles");
    expect(talent.categories).toEqual(["Creator", "Streamer"]);
    expect(talent.miniBio).toContain("streamer");
    const ig = talent.socials.find((s) => s.platform === "instagram")!;
    expect(ig.handle).toBe("agent00"); // leading @ stripped
    expect(ig.followerCount).toBe(1_700_000);
    expect(ig.engagementRate).toBe(4.52);
    const tt = talent.socials.find((s) => s.platform === "tiktok")!;
    expect(tt.followerCount).toBe(2_800_000);
    expect(tt.engagementRate).toBe(9.98);
  });

  it("merges one-row-per-network exports into a single profile", () => {
    const rows = [
      { Creator: "Ashtin Earle", Network: "TikTok", Handle: "ashtin", Followers: "1.30M", "Engagement Rate": "8.25%" },
      { Creator: "Ashtin Earle", Network: "Instagram", Handle: "ashtin", Followers: "646.95K", "Engagement Rate": "3.79%" },
    ];
    const talent = normalizeTalentRows(rows);
    expect(talent).toHaveLength(1);
    expect(talent[0].socials).toHaveLength(2);
    expect(talent[0].socials.find((s) => s.platform === "tiktok")!.followerCount).toBe(1_300_000);
    expect(talent[0].socials.find((s) => s.platform === "instagram")!.engagementRate).toBe(3.79);
  });

  it("keeps our own template format working and ignores nameless rows", () => {
    const rows: Record<string, string>[] = [
      {
        name: "Alex Rivers",
        headline: "Climbing filmmaker",
        age: "29",
        based_in: "Denver",
        categories: "YouTuber; Athlete",
        sports: "Climbing",
        instagram_handle: "alexrivers",
        instagram_followers: "120000",
        instagram_engagement_rate: "3.2%",
      },
      { name: "", instagram_followers: "500" },
    ];
    const talent = normalizeTalentRows(rows);
    expect(talent).toHaveLength(1);
    expect(talent[0].age).toBe(29);
    expect(talent[0].categories).toEqual(["YouTuber", "Athlete"]);
    expect(talent[0].sports).toEqual(["Climbing"]);
    expect(talent[0].socials[0]).toMatchObject({ platform: "instagram", followerCount: 120000, engagementRate: 3.2 });
  });
});
