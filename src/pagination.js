export function getPaginationFooterHtml({ currentPage, totalPages, prevId, nextId, changeFn }) {
  const isMobile = window.innerWidth <= 480;
  let pagesHtml = '';

  if (isMobile) {
    pagesHtml += `<button class="da-page-btn active" onclick="window.${changeFn}(${currentPage})">${currentPage}</button>`;
    if (currentPage < totalPages) {
      pagesHtml += `<button class="da-page-btn" onclick="window.${changeFn}(${currentPage + 1})">${currentPage + 1}</button>`;
    }
    if (currentPage + 1 < totalPages) {
      pagesHtml += `<span class="da-page-ellipsis">…</span>`;
    }
  } else {
    for (let i = 1; i <= totalPages; i++) {
      pagesHtml += `
        <button class="da-page-btn ${i === currentPage ? 'active' : ''}" onclick="window.${changeFn}(${i})">
          ${i}
        </button>
      `;
    }
  }

  return `
    <div class="da-pagination-premium">
      <button class="da-pagination-circle-btn" id="${prevId}" ${currentPage <= 1 ? 'disabled' : ''} 
              onclick="if(${currentPage} > 1) window.${changeFn}(${currentPage} - 1)">
        <span class="material-icons">chevron_left</span>
      </button>
      <div class="da-pagination-pages">
        ${pagesHtml}
      </div>
      <button class="da-pagination-circle-btn" id="${nextId}" ${currentPage >= totalPages ? 'disabled' : ''}
              onclick="if(${currentPage} < ${totalPages}) window.${changeFn}(${currentPage} + 1)">
        <span class="material-icons">chevron_right</span>
      </button>
    </div>
  `;
}
