// Floating virtual joystick (visuals only; the walk mode does the maths).
export class Joystick {
  constructor(root) {
    this.radius = 56;
    this.el = document.createElement('div');
    this.el.className = 'joystick';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = '<div class="joy-base"></div><div class="joy-knob"></div>';
    this.base = this.el.firstChild;
    this.knob = this.el.lastChild;
    root.appendChild(this.el);

    this.hint = document.createElement('div');
    this.hint.className = 'joy-hint';
    this.hint.setAttribute('aria-hidden', 'true');
    this.hint.innerHTML = '<span>Move</span>';
    root.appendChild(this.hint);
  }

  setHint(visible) {
    this.hint.classList.toggle('on', visible);
  }

  show(x, y) {
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.classList.add('on');
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.setHint(false);
  }

  move(dx, dy) {
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  hide() {
    this.el.classList.remove('on');
  }
}
