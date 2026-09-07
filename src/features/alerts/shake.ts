import anime from 'animejs';

let shaking = false;

/** Screen shake — ~4px, 300ms, two oscillation cycles (anime.js) */
export function screenShake(): void {
  if (shaking) return;
  shaking = true;
  const el = document.getElementById('app-root') ?? document.body;
  anime({
    targets: el,
    translateX: [0, 4, -4, 3, -3, 2, -2, 0],
    translateY: [0, -3, 3, -2, 2, -1, 1, 0],
    duration: 300,
    easing: 'easeInOutQuad',
    complete: () => {
      shaking = false;
    },
  });
}