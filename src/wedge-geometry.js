// Shared geometry for the donut-slice wedge paths used by both joysticks.
// Wedges are pie slices of an annulus (outer ring cut out by an inner circle)
// with rounded corners, described clockwise starting at the inner-start corner.
const CENTER = 110;
const R_OUTER = 100;
const R_INNER = 40;
const CORNER_RADIUS = 6;

function point(radius, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(a), y: CENTER - radius * Math.cos(a) };
}

function fmt(n) {
  return n.toFixed(2);
}

function coord(p) {
  return `${fmt(p.x)} ${fmt(p.y)}`;
}

// startAngle/endAngle are degrees clockwise from 12 o'clock.
export function wedgePath(startAngle, endAngle, { rOuter = R_OUTER, rInner = R_INNER, cornerRadius = CORNER_RADIUS } = {}) {
  const dOuter = (cornerRadius / rOuter) * (180 / Math.PI);
  const dInner = (cornerRadius / rInner) * (180 / Math.PI);

  const innerStart = point(rInner + cornerRadius, startAngle);
  const outerStartRadial = point(rOuter - cornerRadius, startAngle);
  const outerStartArc = point(rOuter, startAngle + dOuter);
  const outerEndArc = point(rOuter, endAngle - dOuter);
  const outerEndRadial = point(rOuter - cornerRadius, endAngle);
  const innerEndRadial = point(rInner + cornerRadius, endAngle);
  const innerEndArc = point(rInner, endAngle - dInner);
  const innerStartArc = point(rInner, startAngle + dInner);

  return [
    `M ${coord(innerStart)}`,
    `L ${coord(outerStartRadial)}`,
    `Q ${coord(point(rOuter, startAngle))} ${coord(outerStartArc)}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${coord(outerEndArc)}`,
    `Q ${coord(point(rOuter, endAngle))} ${coord(outerEndRadial)}`,
    `L ${coord(innerEndRadial)}`,
    `Q ${coord(point(rInner, endAngle))} ${coord(innerEndArc)}`,
    `A ${rInner} ${rInner} 0 0 0 ${coord(innerStartArc)}`,
    `Q ${coord(point(rInner, startAngle))} ${coord(innerStart)}`,
    'Z',
  ].join(' ');
}
