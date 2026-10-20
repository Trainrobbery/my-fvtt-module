// Drawing coordinates are scene pixels; polygon vertices are drawing-local.
const EPSILON = 1e-7;

function segmentDistanceSquared(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((x - ax) * dx + (y - ay) * dy) / lengthSquared)) : 0;
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
}

export function polygonContainsPoint(points, x, y) {
  if (!Array.isArray(points) || points.length < 6 || points.length % 2
    || !points.every(Number.isFinite)) return false;
  let inside = false;
  // Even/odd ray crossing handles concave outlines in either winding order.
  // Repeated vertices and an explicitly repeated closing vertex are valid.
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const ax = points[j], ay = points[j + 1];
    const bx = points[i], by = points[i + 1];
    if (segmentDistanceSquared(x, y, ax, ay, bx, by) <= EPSILON ** 2) return true;
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) {
      inside = !inside;
    }
  }
  return inside;
}

export function containsDrawingPoint(drawing, point) {
  const { width, height, type, points } = drawing.shape;
  if (![width, height, drawing.x, drawing.y, point.x, point.y].every(Number.isFinite)) return false;
  // Undo rotation about the drawing center, then translate to local vertices.
  const cx = drawing.x + width / 2;
  const cy = drawing.y + height / 2;
  const angle = -(drawing.rotation ?? 0) * Math.PI / 180;
  const dx = point.x - cx;
  const dy = point.y - cy;
  const x = dx * Math.cos(angle) - dy * Math.sin(angle) + width / 2;
  const y = dx * Math.sin(angle) + dy * Math.cos(angle) + height / 2;

  if (type === "p") {
    // A two-vertex drawing is a line, with no polygon interior.
    if (Array.isArray(points) && points.length === 4 && points.every(Number.isFinite)) {
      const strokeWidth = Number(drawing.strokeWidth ?? 0);
      if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) return false;
      return segmentDistanceSquared(x, y, ...points) <= (strokeWidth / 2) ** 2;
    }
    // Do not fall back to a rectangle when polygon data is missing/invalid.
    return polygonContainsPoint(points, x, y);
  }
  // Preserve the existing bounds-based behavior for other drawing types.
  return width > 0 && height > 0 && x >= 0 && y >= 0 && x <= width && y <= height;
}
