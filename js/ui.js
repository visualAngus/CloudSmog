// ================================================
//  right panel
// ================================================

const right_menu = document.querySelector('.right_menu');
let isOpen = false;

right_menu.addEventListener('click', () => {
  isOpen = !isOpen;
  right_menu.classList.toggle('open', isOpen);
});

document.querySelector('.global__articles').addEventListener('click', (e) => {
  e.stopPropagation();
});

document.querySelectorAll('.close_btn_article').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    btn.closest('.article').style.display = 'none';
  });
});