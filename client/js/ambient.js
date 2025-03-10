// --- js/ambient.js ---

document.addEventListener('DOMContentLoaded', () => {
  const background = document.querySelector('.background');
  const numCircles = 13; //  Number of circles - easily adjustable

  const colors = [
      'rgba(141, 93, 255, 0.5)',  // Green
      'rgba(255, 0, 128, 0.5)', // Pink
      'rgba(0, 225, 255, 0.5)',   // Blue
      'rgba(255, 55, 88, 0.5)',    // Yellow
      '#ff4ff6',
      '#fe4f98',
      '#68afff'
      // Add more colors if you want!
  ];


  for (let i = 0; i < numCircles; i++) {
      const circle = document.createElement('div');
      circle.classList.add('circle');

      // Randomize size, position, animation delay, and color
      const size = Math.random() * 600 + 200; //  Sizes between 200px and 600px
      const x = (Math.random() * 300) - 150;     //  -50% to 50%
      const y = (Math.random() * 300) - 150;
      const scale = Math.random() * 0.2 + 1.2;    // Scale between 0.8 and 1.2

      const delay = Math.random() * 2;       //  Animation delay up to 10s
      const color = colors[Math.floor(Math.random() * colors.length)];

      //  Set CSS variables for the animation.  MUCH cleaner.
      circle.style.setProperty('--x', `${x}%`);
      circle.style.setProperty('--y', `${y}%`);
      circle.style.setProperty('--scale', scale);

      circle.style.width = `${size}px`;
      circle.style.height = `${size}px`;
      circle.style.animationDelay = `${delay}s`;
      circle.style.animationDuration = `${Math.random() * 10 + 10}s`; // Randomize duration between 10-20 seconds
      circle.style.background = `radial-gradient(circle, ${color}, transparent 70%)`;


      background.appendChild(circle);
  }
});