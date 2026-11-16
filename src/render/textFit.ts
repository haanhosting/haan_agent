/**
 * In-browser text fit logic to shrink font size on overflowing text containers.
 * Reduces font-size in 2px steps until text fits or hits 70% floor.
 */
export const TEXT_FIT_SCRIPT = `
(function fitAllText() {
  const elements = document.querySelectorAll('.auto-shrink');
  elements.forEach(el => {
    const computed = window.getComputedStyle(el);
    const initialSize = parseFloat(computed.fontSize);
    const minSize = Math.max(16, Math.floor(initialSize * 0.70));
    let currentSize = initialSize;

    // Check if element or parent card overflows
    function isOverflowing() {
      const elOverflow = el.scrollHeight > (el.clientHeight + 2) || el.scrollWidth > (el.clientWidth + 2);
      const parent = el.closest('.t01-body, .t02-split-container, .t03-container, .t04-container, .t05-container, .t06-container, .t07-container, .t08-container, .t09-container, .t10-container, .t11-container, .t12-container, .card');
      const parentOverflow = parent ? (parent.scrollHeight > (parent.clientHeight + 4)) : false;
      return elOverflow || parentOverflow;
    }

    while (isOverflowing() && currentSize > minSize) {
      currentSize -= 2;
      el.style.fontSize = currentSize + 'px';
      el.style.lineHeight = '1.25';
    }
  });
})();
`;
