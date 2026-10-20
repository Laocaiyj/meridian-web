export const quartzShader = /* wgsl */ `
struct Frame { size: vec2f, progress: f32, aspect: f32, viewportAspect: f32, accentY: f32, accentProgress: f32, padding: f32, crop: vec2f, exitSize: vec2f }
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var exitSurface: texture_2d<f32>;
struct Vertex {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) uv: vec2f,
  @location(2) normal: vec3f,
  @location(3) @interpolate(flat) edge: f32,
  @location(4) @interpolate(flat) accent: f32
}
fn cameraTarget() -> vec3f { return vec3f(0.); }
fn focalLength() -> f32 { return 4.2 * min(1., frame.aspect); }
fn screenOffset(accent: f32) -> vec2f {
  let ratio = frame.aspect/frame.viewportAspect;
  return select(vec2f(1.+.004*ratio,0.),vec2f(-.64,frame.accentY),accent>.5);
}
fn hingeAngle(u: f32, t: f32) -> f32 {
  var accumulated = 0.;
  for (var i = 0; i < 12; i++) {
    let lag = .08 * f32(i) / 11.;
    let opening = smoothstep(lag, .92 + lag, t);
    let width = mix(.025, 2.72, opening) / 12.;
    accumulated += clamp(u * 12. - f32(i), 0., 1.) * width;
  }
  return mix(-1.60, -1.36, smoothstep(0., 1., t)) + accumulated;
}
fn surface(uv: vec2f, t: f32) -> vec3f {
  let slot = min(11., floor(uv.x*12.));
  let local = clamp(uv.x*12.-slot,0.,1.);
  let a = hingeAngle(slot/12.,t);
  let b = hingeAngle((slot+1.)/12.,t);
  let radius = .10 + uv.y * 1.64;
  let left = vec3f(-cos(a)*radius,sin(a)*radius*.78,(.5-slot/12.)*.16);
  let right = vec3f(-cos(b)*radius,sin(b)*radius*.78,(.5-(slot+1.)/12.)*.16);
  let ridge = 1.-abs(local*2.-1.);
  let halfPanel = radius * .118;
  let halfChord = length(right.xy-left.xy)*.5;
  let fold = sqrt(max(.0004,halfPanel*halfPanel-halfChord*halfChord));
  let root = (uv.x-.5)*.22*pow(1.-uv.y,2.);
  return mix(left,right,local) + vec3f(.10*pow(1.-uv.y,2.),root,ridge*fold);
}
fn skin(uv: vec2f, layer: f32, t: f32) -> vec3f {
  let thickness = .06 + uv.y*.025;
  let bevel = mix(.72,1.,smoothstep(0.,.045,uv.y)) * mix(.72,1.,smoothstep(0.,.045,1.-uv.y));
  return surface(uv,t) + vec3f(0.,0.,layer*thickness*bevel);
}
fn orient(p: vec3f) -> vec3f {
  let yaw = -.12;
  let pitch = -.12;
  let roll = .03;
  let a = vec3f(p.x * cos(yaw) + p.z * sin(yaw), p.y, -p.x * sin(yaw) + p.z * cos(yaw));
  let b = vec3f(a.x, a.y * cos(pitch) - a.z * sin(pitch), a.y * sin(pitch) + a.z * cos(pitch));
  return vec3f(b.x * cos(roll) - b.y * sin(roll), b.x * sin(roll) + b.y * cos(roll), b.z);
}
fn part(uv: vec2f, layer: f32, t: f32, accent: f32) -> vec3f {
  let p = orient(skin(uv,layer,t));
  let wide = -p.y * 1.35;
  let down = p.x * .60;
  let tilt = -.42;
  let upper = vec3f(wide*cos(tilt)+down*sin(tilt),-wide*sin(tilt)+down*cos(tilt),p.z*.90-.70);
  return select(p,upper,accent>.5);
}
fn meshVertex(uv: vec2f, layer: f32, center: f32, instance: u32, cropped: bool) -> Vertex {
  let accent = f32(instance);
  let t = select(frame.progress,frame.accentProgress,instance==1u);
  let world = part(uv,layer,t,accent);
  let relative = world - cameraTarget();
  let depth = 4.2 - relative.z;
  let aspect = frame.viewportAspect;
  let focal = focalLength();
  var output: Vertex;
  output.position = vec4f(relative.x * focal / aspect + depth * screenOffset(accent).x, relative.y * focal + depth * screenOffset(accent).y, depth * 1.005025 - .100503, depth);
  if (cropped) { output.position.y = (output.position.y+depth*(2.*frame.crop.x+frame.crop.y-1.))/frame.crop.y; }
  output.world = world;
  output.uv = uv;
  let faceU = select(center, uv.x, center < 0.);
  let point = vec2f(faceU, uv.y);
  let du = part(point + vec2f(.0005, 0.),layer,t,accent) - part(point - vec2f(.0005, 0.),layer,t,accent);
  let dv = part(point + vec2f(0., .0005),layer,t,accent) - part(point - vec2f(0., .0005),layer,t,accent);
  output.normal = normalize(cross(dv, du)) * layer;
  output.accent = accent;
  output.edge = select(0., 1., center < 0.);
  return output;
}
@vertex fn vertex(@location(0) uv: vec2f, @location(1) layer: f32, @location(2) center: f32, @builtin(instance_index) instance: u32) -> Vertex {
  return meshVertex(uv,layer,center,instance,true);
}
@vertex fn exitVertex(@location(0) uv: vec2f, @location(1) layer: f32, @location(2) center: f32, @builtin(instance_index) instance: u32) -> Vertex {
  return meshVertex(uv,layer,center,instance,false);
}
fn environment(direction: vec3f) -> vec3f {
  let d = normalize(direction);
  let longBox = smoothstep(-.80, -.70, d.x) * (1. - smoothstep(-.19, -.09, d.x));
  let upperBox = smoothstep(.28, .38, d.y) * (1. - smoothstep(.62, .72, d.y));
  let strip = smoothstep(.40, .41, d.x) * (1. - smoothstep(.46, .47, d.x));
  return vec3f(.12, .13, .17) + vec3f(1.3, 1.35, 1.45) * longBox + vec3f(.8, .83, .9) * upperBox + vec3f(2.) * strip;
}
fn exitSample(pixel: vec2f) -> vec4f {
  let base = vec2i(floor(pixel));
  let weight = fract(pixel);
  let limit = vec2i(frame.exitSize)-1;
  let a=textureLoad(exitSurface,clamp(base,vec2i(0),limit),0);
  let b=textureLoad(exitSurface,clamp(base+vec2i(1,0),vec2i(0),limit),0);
  let c=textureLoad(exitSurface,clamp(base+vec2i(0,1),vec2i(0),limit),0);
  let d=textureLoad(exitSurface,clamp(base+vec2i(1,1),vec2i(0),limit),0);
  return mix(mix(a,b,weight.x),mix(c,d,weight.x),weight.y);
}
fn flakeDetail(uv: vec2f, normal: vec3f, view: vec3f) -> vec2f {
  let coordinate = vec2f(uv.x*130.0+uv.y*23.0,uv.y*95.0-uv.x*17.0);
  let cell = floor(coordinate);
  let seed = fract(sin(vec3f(dot(cell,vec2f(127.1,311.7)),dot(cell,vec2f(269.5,183.3)),dot(cell,vec2f(419.2,371.9))))*43758.5453);
  let local = fract(coordinate)-mix(vec2f(.18),vec2f(.82),seed.yz);
  let angle = seed.z*6.283185;
  let rotated = vec2f(local.x*cos(angle)-local.y*sin(angle),local.x*sin(angle)+local.y*cos(angle));
  let distance = abs(rotated.x)*.75+abs(rotated.y)*1.25;
  let footprint = max(max(fwidth(coordinate).x,fwidth(coordinate).y),.015);
  let radius = mix(.16,.29,seed.y);
  let coverage = (1.-smoothstep(radius-footprint*.65,radius+footprint*.65,distance))*min(1.,radius*radius/(footprint*footprint+.001));
  // Fixed UV cells avoid swimming; undersampled inclusions fade instead of flickering.
  let amount = coverage*step(.82,seed.x)*(1.-smoothstep(.6,1.5,footprint));
  let flakeNormal = normalize(normal+vec3f((seed.y-.5)*.65,(seed.z-.5)*.65,.12));
  let light = normalize(vec3f(-.7,.5,1.));
  let glint = pow(max(dot(flakeNormal,normalize(view+light)),0.),24.);
  return vec2f(amount,glint);
}
@fragment fn exitFragment(input: Vertex) -> @location(0) vec4f {
  let view = normalize(cameraTarget() + vec3f(0., 0., 4.2) - input.world);
  let edgeNormal = cross(dpdx(input.world), dpdy(input.world));
  var normal = normalize(select(input.normal, edgeNormal, input.edge > .5));
  normal *= select(1., -1., dot(normal, view) >= 0.);
  return vec4f(normal, input.world.z);
}
@fragment fn fragment(input: Vertex) -> @location(0) vec4f {
  let view = normalize(cameraTarget() + vec3f(0., 0., 4.2) - input.world);
  // Interpolated world-space derivatives follow the actual folded faces.
  let edgeNormal = cross(dpdx(input.world), dpdy(input.world));
  var normal = normalize(select(input.normal, edgeNormal, input.edge > .5));
  normal *= select(-1., 1., dot(normal, view) >= 0.);
  let facing = max(dot(normal, view), .045);
  let reflected = reflect(-view, normal);
  let refracted = refract(-view, normal, 1. / 1.545);
  let screenUV = input.position.xy/frame.size;
  let backUV = vec2f(screenUV.x,frame.crop.x+screenUV.y*frame.crop.y);
  let back = exitSample(backUV*frame.exitSize-vec2f(.5));
  let travel = max(.025, abs(input.world.z - back.w)) / max(abs(refracted.z), .12);
  let exitPoint = input.world + refracted * travel;
  let aspect = frame.viewportAspect;
  let focal = focalLength();
  let exitRelative = exitPoint - cameraTarget();
  let offset = screenOffset(input.accent);
  let projected = vec2f(exitRelative.x * focal / aspect, -exitRelative.y * focal) / (4.2 - exitRelative.z) + vec2f(offset.x, -offset.y);
  let logicalUV = projected*.5+.5;
  let sampledBack = exitSample(logicalUV * frame.exitSize - vec2f(.5));
  let exitNormal = normalize(select(-normal, sampledBack.xyz, dot(sampledBack.xyz, sampledBack.xyz) > .1));
  let leaving = refract(refracted, -exitNormal, 1.545);
  let totalInternal = dot(leaving, leaving) < .01;
  let ray = select(leaving, reflect(refracted, -exitNormal), totalInternal);
  let zoning = .6 + .4 * smoothstep(.3, .85, input.uv.y);
  let absorption = exp(-select(vec3f(.38,.85,.10),vec3f(.75,.70,.65),input.accent>.5) * travel * 2.4 * zoning);
  let outside = environment(ray + input.world * .12) * select(1.,.10,input.accent>.5);
  let transmission = mix(select(vec3f(.76,.65,.96),vec3f(.018,.022,.032),input.accent>.5), outside, select(.48, .85, totalInternal)) * absorption;
  let reflection = environment(reflected) * select(1.,.55,input.accent>.5);
  let fresnel = .046 + .954 * pow(1. - facing, 5.);
  let edgeU = select(input.uv.x,fract(input.uv.x),input.uv.x>=2.);
  let edgeDistance = min(min(edgeU, 1. - edgeU), min(input.uv.y, 1. - input.uv.y));
  let edge = 1. - smoothstep(.001, .001 + max(fwidth(edgeDistance), .0004) * 1.2, edgeDistance);
  let body = mix(transmission, reflection, fresnel) + reflection * .045;
  let polished = mix(body, reflection * .58 + select(vec3f(.12,.10,.17),vec3f(.08,.085,.10),input.accent>.5), edge * .55);
  let flake = flakeDetail(input.uv,normal,view);
  let inclusion = mix(vec3f(.09,.075,.14),vec3f(2.,2.1,2.4),flake.y);
  let graphite = polished*(1.-flake.x*.55)+inclusion*flake.x*.35;
  let silverGray = mix(vec3f(.64,.66,.70),vec3f(1.8,1.85,1.95),flake.y);
  // Lavender keeps a light smoky floor; dark reflections belong only to the graphite actor.
  let lavenderBody = vec3f(.44,.39,.52)+polished*vec3f(.56,.61,.48);
  let lavender = mix(lavenderBody,silverGray,flake.x*.82);
  let color = select(lavender,graphite,input.accent>.5);
  // Compress bright studio reflections before display conversion: crystal retains
  // its lavender body instead of clipping to featureless white.
  let linear = max(color, vec3f(0.));
  let shoulder = vec3f(.9) + .1 * (vec3f(1.) - exp(-max(linear-vec3f(.9),vec3f(0.))*5.));
  let display = select(linear,shoulder,linear>vec3f(.9));
  return vec4f(pow(display, vec3f(1. / 2.2)), 1.);
}
`;

/** Spatial edge resolve. Premultiplied RGBA stays intact at the transparent silhouette. */
export const quartzEdgeShader = `
@group(0) @binding(0) var resolvedColor: texture_2d<f32>;
@group(0) @binding(1) var edgeSampler: sampler;
@vertex fn edgeVertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
  return vec4f(positions[index],0.0,1.0);
}
fn readColor(uv: vec2f) -> vec4f {
  return textureSampleLevel(resolvedColor,edgeSampler,uv,0.0);
}
fn perceivedLuma(color: vec4f) -> f32 {
  // Detect the visible edge against the page's white, not transparent black.
  return dot(color.rgb+vec3f(1.0-color.a),vec3f(0.299,0.587,0.114));
}
@fragment fn edgeFragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let texel = 1.0/vec2f(textureDimensions(resolvedColor));
  let uv = position.xy*texel;
  let center = readColor(uv);
  let middle = perceivedLuma(center);
  let nw = perceivedLuma(readColor(uv+vec2f(-1.0,-1.0)*texel));
  let ne = perceivedLuma(readColor(uv+vec2f(1.0,-1.0)*texel));
  let sw = perceivedLuma(readColor(uv+vec2f(-1.0,1.0)*texel));
  let se = perceivedLuma(readColor(uv+vec2f(1.0,1.0)*texel));
  let low = min(middle,min(min(nw,ne),min(sw,se)));
  let high = max(middle,max(max(nw,ne),max(sw,se)));
  if (high-low < max(0.018,high*0.075)) { return center; }
  var direction = vec2f(-((nw+ne)-(sw+se)),(nw+sw)-(ne+se));
  let reduce = max((nw+ne+sw+se)*0.03125,0.0078125);
  direction = clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),vec2f(-6.0),vec2f(6.0))*texel;
  let narrow = 0.5*(readColor(uv-direction/6.0)+readColor(uv+direction/6.0));
  let wide = narrow*0.5+0.25*(readColor(uv-direction*0.5)+readColor(uv+direction*0.5));
  let luminance = perceivedLuma(wide);
  return select(wide,narrow,luminance<low || luminance>high);
}
`;
