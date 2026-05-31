import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ0OS1kMWFjYmFkNjc5YzciLCJpZCI6NTc3MzMsImlhdCI6MTYyMjAyNjAxOH0.XcKpgANiY19MC4bdFUXMVEBToBmqS8kuYpUlxJHYZxk';

export const DEFAULT_VIEW = {
  longitude: 116.397,
  latitude: 39.908,
  height: 3000,
  heading: 0,
  pitch: -45,
  roll: 0
};

export function createViewer(container) {
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: true,
    geocoder: true,
    homeButton: true,
    sceneModePicker: true,
    navigationHelpButton: false,
    fullscreenButton: true,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: true,
    terrainProvider: Cesium.createWorldTerrain(),
    imageryProvider: new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      credit: '© Esri',
      maximumLevel: 19
    })
  });

  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.0002;
  viewer.scene.globe.depthTestAgainstTerrain = true;

  viewer.scene.postProcessStages.fxaa.enabled = true;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      DEFAULT_VIEW.longitude,
      DEFAULT_VIEW.latitude,
      DEFAULT_VIEW.height
    ),
    orientation: {
      heading: Cesium.Math.toRadians(DEFAULT_VIEW.heading),
      pitch: Cesium.Math.toRadians(DEFAULT_VIEW.pitch),
      roll: Cesium.Math.toRadians(DEFAULT_VIEW.roll)
    }
  });

  return viewer;
}

export function flyTo(viewer, longitude, latitude, height = 500, duration = 2) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0
    },
    duration: duration
  });
}

export function getCameraPosition(viewer) {
  const cartographic = Cesium.Cartographic.fromCartesian(viewer.camera.position);
  return {
    longitude: Cesium.Math.toDegrees(cartographic.longitude),
    latitude: Cesium.Math.toDegrees(cartographic.latitude),
    height: cartographic.height
  };
}

export function screenToLonLat(viewer, x, y) {
  const pick = new Cesium.Cartesian2(x, y);
  const ray = viewer.camera.getPickRay(pick);
  const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
  
  if (cartesian) {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    return {
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude)
    };
  }
  return null;
}
