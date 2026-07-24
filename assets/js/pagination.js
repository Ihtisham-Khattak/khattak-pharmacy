/**
 * Reusable pagination for PharmaSpot list views.
 *
 * Usage:
 *   const Pagination = require("./pagination");
 *   Pagination.render({
 *     total: 100,
 *     page: 1,
 *     limit: 10,
 *     mount: "#productPagination",
 *     onPageChange: (page) => loadList(page),
 *     showPageSize: true,
 *     pageSizes: [10, 25, 50],
 *     onPageSizeChange: (limit) => loadList(1, limit),
 *   });
 */

function clampPage(page, totalPages) {
  if (totalPages < 1) return 1;
  if (page < 1) return 1;
  if (page > totalPages) return totalPages;
  return page;
}

/**
 * @param {object} options
 * @param {number} options.total - total item count
 * @param {number} options.page - current 1-based page
 * @param {number} options.limit - page size
 * @param {string|HTMLElement|JQuery} options.mount - container to render into
 * @param {(page: number) => void} options.onPageChange
 * @param {boolean} [options.showPageSize=true]
 * @param {number[]} [options.pageSizes=[10,25,50]]
 * @param {(limit: number) => void} [options.onPageSizeChange]
 * @param {string} [options.namespace] - unique suffix for event binding
 */
function render(options) {
  const $ = window.jQuery || window.$;
  if (!$ || !options || !options.mount) {
    return;
  }

  const total = Math.max(0, parseInt(options.total, 10) || 0);
  const limit = Math.max(1, parseInt(options.limit, 10) || 10);
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const page = clampPage(parseInt(options.page, 10) || 1, totalPages);
  const showPageSize = options.showPageSize !== false;
  const pageSizes = Array.isArray(options.pageSizes)
    ? options.pageSizes
    : [10, 25, 50];
  const ns = options.namespace || "default";
  const $mount = $(options.mount);

  if (!$mount.length) {
    return;
  }

  const prevDisabled = page <= 1 ? "disabled" : "";
  const nextDisabled = page >= totalPages ? "disabled" : "";
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  let sizeOptions = "";
  if (showPageSize) {
    sizeOptions = pageSizes
      .map((size) => {
        const selected = size === limit ? " selected" : "";
        return `<option value="${size}"${selected}>${size}</option>`;
      })
      .join("");
  }

  const html = `
    <div class="ps-pagination" data-pagination-ns="${ns}">
      <div class="ps-pagination-meta text-muted">
        Showing ${startItem}–${endItem} of ${total}
      </div>
      <ul class="pagination pagination-sm m-0">
        <li class="${prevDisabled}">
          <a href="#" class="ps-page-btn" data-page="${page - 1}" aria-label="Previous">Previous</a>
        </li>
        <li class="active"><a href="#">Page ${page} of ${totalPages}</a></li>
        <li class="${nextDisabled}">
          <a href="#" class="ps-page-btn" data-page="${page + 1}" aria-label="Next">Next</a>
        </li>
      </ul>
      ${
        showPageSize
          ? `<div class="ps-pagination-size">
              <label class="m-0">Per page
                <select class="form-control input-sm ps-page-size">${sizeOptions}</select>
              </label>
            </div>`
          : ""
      }
    </div>
  `;

  $mount.html(html);

  $mount.off(`.psPagination_${ns}`);
  $mount.on(`click.psPagination_${ns}`, ".ps-page-btn", function (e) {
    e.preventDefault();
    if ($(this).parent().hasClass("disabled")) {
      return;
    }
    const nextPage = parseInt($(this).data("page"), 10);
    if (typeof options.onPageChange === "function") {
      options.onPageChange(nextPage);
    }
  });

  if (showPageSize && typeof options.onPageSizeChange === "function") {
    $mount.on(`change.psPagination_${ns}`, ".ps-page-size", function () {
      const newLimit = parseInt($(this).val(), 10) || limit;
      options.onPageSizeChange(newLimit);
    });
  }
}

/**
 * Legacy adapter matching older renderPagination(total, limit, page, type, container)
 * used across pos.js. Prefer Pagination.render going forward.
 */
function renderLegacy(total, limit, page, type, container, handlers) {
  const $ = window.jQuery || window.$;
  if (!$ || !container) {
    return;
  }

  const $anchor = $(container);
  if (!$anchor.length) {
    return;
  }

  let $mount = $anchor.siblings(".pagination-container");
  if (!$mount.length) {
    $mount = $("<div class=\"pagination-container\"></div>");
    $anchor.after($mount);
  }

  render({
    total,
    limit,
    page,
    mount: $mount,
    namespace: String(type || "legacy"),
    showPageSize: false,
    onPageChange: function (nextPage) {
      if (handlers && typeof handlers[type] === "function") {
        handlers[type](nextPage);
      }
    },
  });
}

module.exports = {
  render,
  renderLegacy,
};
