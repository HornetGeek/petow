// Quick runtime patch for react-native-maps class-field collision.
// Some bundler setups transpile class fields so instances end up with
// `getNativeComponent = undefined`, shadowing the prototype method added by
// decorateMapComponent. Clearing the undefined own property before render
// restores the prototype implementation.
import {
  Marker,
  Overlay,
  Polyline,
  Heatmap,
  Polygon,
  Circle,
  UrlTile,
  WMSTile,
  LocalTile,
  Callout,
  CalloutSubview,
} from 'react-native-maps';

const components = [Marker, Overlay, Polyline, Heatmap, Polygon, Circle, UrlTile, WMSTile, LocalTile, Callout, CalloutSubview];

const patchComponent = (Comp: any) => {
  if (!Comp || !Comp.prototype) return;
  const originalRender = Comp.prototype.render;
  if (!originalRender || (originalRender as any).__patchedGetNativeComponent) return;

  Comp.prototype.render = function patchedRender(...args: any[]) {
    if (this.getNativeComponent === undefined) {
      // remove the shadowing instance field so prototype method is used
      delete this.getNativeComponent;
    }
    return originalRender.apply(this, args);
  };

  (Comp.prototype.render as any).__patchedGetNativeComponent = true;
};

components.forEach(patchComponent);

export {};
