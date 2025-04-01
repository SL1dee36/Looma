// --- js/ambient.js ---

document.addEventListener('DOMContentLoaded', () => {
  const background = document.querySelector('.background');

  // --- Добавлена проверка существования элемента ---
  if (!background) {
    console.error('Элемент с классом .background не найден!');
    return; // Выход, если элемент не найден
  }

  const numCircles = 13; // Number of circles - easily adjustable

  const colors = [
    'rgba(141, 93, 255, 0.5)', // Greenish Purple? (Original comment said Green)
    'rgba(255, 0, 128, 0.5)',  // Pink
    'rgba(0, 225, 255, 0.5)',  // Blue
    'rgba(255, 55, 88, 0.5)',   // Reddish Pink? (Original comment said Yellow)
    '#ff4ff6',
    '#fe4f98',
    '#68afff'
    // Add more colors if you want!
  ];

  // --- Создаем DocumentFragment ---
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < numCircles; i++) {
      const circle = document.createElement('div');
      circle.classList.add('circle');

      // Randomize size, position, animation delay, and color
      const size = Math.random() * 400 + 200; // Sizes between 200px and 600px (Slightly adjusted range from original for variety)
      const x = (Math.random() * 200) - 100;  // -100% to 100% (Adjusted range for potentially wider movement)
      const y = (Math.random() * 200) - 100;
      const scale = Math.random() * 0.4 + 1.1; // Scale between 1.1 and 1.5 (Adjusted range)

      const delay = Math.random() * 5;        // Animation delay up to 5s (Adjusted)
      const duration = Math.random() * 10 + 15; // Randomize duration between 15-25 seconds (Adjusted)
      const color = colors[Math.floor(Math.random() * colors.length)];

      // Set CSS variables for the animation. MUCH cleaner.
      circle.style.setProperty('--x', `${x}%`);
      circle.style.setProperty('--y', `${y}%`);
      circle.style.setProperty('--scale', scale);

      circle.style.width = `${size}px`;
      circle.style.height = `${size}px`;
      circle.style.animationDelay = `${delay}s`;
      circle.style.animationDuration = `${duration}s`;
      // Оптимизированный градиент: делаем переход более плавным
      circle.style.background = `radial-gradient(circle, ${color} 0%, transparent 75%)`;
      // Можно добавить will-change, но для 13 элементов необязательно
      // circle.style.willChange = 'transform';

      // --- Добавляем элемент во fragment, а не напрямую в background ---
      fragment.appendChild(circle);
  }

  // --- Добавляем ВСЕ круги в DOM одним действием ---
  background.appendChild(fragment);
});