/**
 * In-browser text fit logic per STYLE_REFERENCE.md:
 * Measures overflow on the .post canvas (1080x1350) and shrinks font-size
 * in steps of 2px (floor 64px for headlines, 34px for body) only when
 * content actually exceeds the available canvas or horizontal width.
 */
export const TEXT_FIT_SCRIPT = `
(function fitAllText() {
  const post = document.querySelector('.post, .canvas');
  if (!post) return;

  const elements = Array.from(document.querySelectorAll('.auto-shrink, h1, .box b'));
  elements.forEach(el => {
    const computed = window.getComputedStyle(el);
    const initialSize = parseFloat(computed.fontSize);
    const isHeading = el.tagName === 'H1' || el.tagName === 'B' || el.classList.contains('stat-number');
    const minSize = isHeading ? 64 : 34;
    let currentSize = initialSize;

    function isOverflowing() {
      const horizOverflow = el.scrollWidth > (el.clientWidth + 4);
      const postOverflow = post.scrollHeight > 1352 || post.scrollWidth > 1082;
      return horizOverflow || postOverflow;
    }

    while (isOverflowing() && currentSize > minSize) {
      currentSize -= 2;
      el.style.fontSize = currentSize + 'px';
    }
  });
})();
`;
