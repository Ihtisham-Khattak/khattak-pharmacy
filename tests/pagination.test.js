/**
 * Lightweight tests for Pagination module (no jsdom required).
 */

describe("Pagination helper", () => {
  let Pagination;
  let lastHtml;
  let pageHandler;
  let boundHandlers;

  beforeEach(() => {
    lastHtml = "";
    pageHandler = jest.fn();
    boundHandlers = {};

    const mountApi = {
      length: 1,
      html: jest.fn((html) => {
        lastHtml = html;
        return mountApi;
      }),
      off: jest.fn(() => mountApi),
      on: jest.fn((evt, selector, handler) => {
        if (typeof selector === "function") {
          boundHandlers[evt] = selector;
        } else {
          boundHandlers[`${evt}:${selector}`] = handler;
        }
        return mountApi;
      }),
    };

    const $ = jest.fn((sel) => {
      if (sel === "#pager" || sel === mountApi) return mountApi;
      return { length: 0 };
    });

    global.window = { jQuery: $, $ };
    global.$ = $;
    global.jQuery = $;

    jest.resetModules();
    Pagination = require("../assets/js/pagination");
  });

  test("render writes page meta and controls into mount", () => {
    Pagination.render({
      total: 45,
      page: 2,
      limit: 10,
      mount: "#pager",
      namespace: "test",
      onPageChange: pageHandler,
    });

    expect(lastHtml).toContain("Showing 11–20 of 45");
    expect(lastHtml).toContain("Page 2 of 5");
    expect(lastHtml).toContain("ps-page-btn");
    expect(lastHtml).toContain("ps-page-size");
  });

  test("renderLegacy mounts beside anchor container", () => {
    const after = jest.fn();
    const siblings = jest.fn(() => ({ length: 0 }));
    const anchor = {
      length: 1,
      siblings,
      after,
    };

    global.$ = jest.fn((sel) => {
      if (sel === "#userList") return anchor;
      if (typeof sel === "string" && sel.includes("pagination-container")) {
        return {
          length: 1,
          html: jest.fn((html) => {
            lastHtml = html;
          }),
          off: jest.fn(function () {
            return this;
          }),
          on: jest.fn(function () {
            return this;
          }),
        };
      }
      return { length: 0 };
    });
    global.window = { jQuery: global.$, $: global.$ };

    jest.resetModules();
    Pagination = require("../assets/js/pagination");

    Pagination.renderLegacy(20, 10, 1, "loadUserList", "#userList", {
      loadUserList: pageHandler,
    });

    expect(after).toHaveBeenCalled();
  });
});
