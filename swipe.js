export function swipeDirection(dx,dy,threshold=64){return Math.abs(dx)>=threshold&&Math.abs(dx)>Math.abs(dy)*1.25?(dx>0?'right':'left'):null;}
