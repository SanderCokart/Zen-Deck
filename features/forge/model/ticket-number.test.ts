import { describe, expect, it } from "vitest";
import { ticketFolderName, ticketNumbersIn } from "@/features/forge/model/ticket-number";

describe("ticketNumbersIn", () => {
  it("finds numbers however the tracker marks them", () => {
    expect(ticketNumbersIn("[#482913] Re[2]: Checkout total : Helpdesk")).toEqual(["482913"]);
    expect(ticketNumbersIn("Draft: [482913]: fix total")).toEqual(["482913"]);
    expect(ticketNumbersIn("@482913 follow-up")).toEqual(["482913"]);
    expect(ticketNumbersIn("SHOP-1234 Broken cart")).toEqual(["1234"]);
  });

  it("skips short numbers, percentages, decimals, years and MR references", () => {
    expect(ticketNumbersIn("Re[2]: 21% VAT on quote 162")).toEqual([]);
    expect(ticketNumbersIn("MR: !20107 - Plan for 2026")).toEqual([]);
    expect(ticketNumbersIn("Total 1234.56 or 12,3456")).toEqual([]);
    expect(ticketNumbersIn("build v12345 abc12345")).toEqual([]);
  });

  it("drops excluded ids and repeats", () => {
    expect(ticketNumbersIn("#5001 and 6001 and 6001", ["5001"])).toEqual(["6001"]);
  });
});

describe("ticketFolderName", () => {
  it("prefixes the number and removes its marker from the title", () => {
    expect(ticketFolderName("482913", "[#482913] Re: Checkout total")).toBe(
      "#482913 Re: Checkout total",
    );
    expect(ticketFolderName("482913", "@482913 Checkout")).toBe("#482913 Checkout");
    expect(ticketFolderName("482913", undefined)).toBe("#482913");
  });
});
