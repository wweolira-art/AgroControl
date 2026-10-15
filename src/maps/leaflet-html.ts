import type { FeatureCollection, MapRegion } from '../types/geo';

const SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const STREET = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function buildMapHtml(region: MapRegion): string {
  const lat = region.latitude;
  const lng = region.longitude;
  const zoom = Math.max(5, Math.min(18, Math.round(Math.log2(360 / Math.max(region.longitudeDelta, 0.002)))));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; width: 100%; margin: 0; padding: 0; background: #cfd8dc; }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const SAT = '${SATELLITE}';
    const OSM = '${STREET}';
    const map = L.map('map', { zoomControl: true, fadeAnimation: false, zoomAnimation: false }).setView([${lat}, ${lng}], ${zoom});
    let tileLayer = L.tileLayer(SAT, { maxZoom: 19, attribution: 'Esri / OSM' }).addTo(map);

    let geoLayer = L.layerGroup().addTo(map);
    let draftLayer = L.layerGroup().addTo(map);
    let userMarker = null;
    let selectedLayer = null;
    let drawMode = false;
    let draft = [];

    function send(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    function emitRegion() {
      const b = map.getBounds();
      const c = map.getCenter();
      send({
        type: 'region',
        latitude: c.lat,
        longitude: c.lng,
        latitudeDelta: Math.max(0.004, b.getNorth() - b.getSouth()),
        longitudeDelta: Math.max(0.004, b.getEast() - b.getWest())
      });
    }

    function renderDraft() {
      draftLayer.clearLayers();
      if (!draft.length) return;
      var latlngs = draft.map(function (p) { return [p[0], p[1]]; });
      if (latlngs.length >= 3) {
        L.polygon(latlngs, { color: '#F9A825', weight: 3, fillColor: '#F9A825', fillOpacity: 0.35 }).addTo(draftLayer);
      } else if (latlngs.length >= 2) {
        L.polyline(latlngs, { color: '#F9A825', weight: 3 }).addTo(draftLayer);
      }
      latlngs.forEach(function (ll, i) {
        L.circleMarker(ll, {
          radius: i === latlngs.length - 1 ? 8 : 6,
          color: '#ffffff',
          weight: 2,
          fillColor: '#F9A825',
          fillOpacity: 1
        }).addTo(draftLayer);
      });
    }

    function emitDraft() {
      send({
        type: 'draft',
        points: draft.map(function (p) { return { latitude: p[0], longitude: p[1] }; })
      });
    }

    function setDrawMode(on) {
      drawMode = !!on;
    }

    function setDraft(points) {
      draft = (points || []).map(function (p) {
        if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
        return [Number(p.latitude), Number(p.longitude)];
      }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
      renderDraft();
    }

    function undoDraft() {
      draft.pop();
      renderDraft();
      emitDraft();
    }

    function clearDraft() {
      draft = [];
      renderDraft();
      emitDraft();
    }

    map.whenReady(function () {
      send({ type: 'ready' });
      emitRegion();
    });
    map.on('moveend', emitRegion);
    map.on('click', function (e) {
      if (drawMode) {
        draft.push([e.latlng.lat, e.latlng.lng]);
        renderDraft();
        emitDraft();
        return;
      }
      send({ type: 'press', latitude: e.latlng.lat, longitude: e.latlng.lng });
    });

    function setImagery(kind) {
      map.removeLayer(tileLayer);
      tileLayer = L.tileLayer(kind === 'street' ? OSM : SAT, { maxZoom: 19, attribution: 'Esri / OSM' }).addTo(map);
    }

    function setUser(lat, lng) {
      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
        return;
      }
      userMarker = L.circleMarker([lat, lng], {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: '#1E88E5',
        fillOpacity: 1
      }).addTo(map);
    }

    function flyTo(lat, lng, latDelta, lngDelta) {
      const south = lat - (latDelta || 0.01) / 2;
      const north = lat + (latDelta || 0.01) / 2;
      const west = lng - (lngDelta || 0.01) / 2;
      const east = lng + (lngDelta || 0.01) / 2;
      map.fitBounds([[south, west], [north, east]], { animate: false, maxZoom: 16, padding: [28, 28] });
    }

    function setPolygons(features) {
      geoLayer.clearLayers();
      if (!features || !features.length) return;
      var layer = L.geoJSON({ type: 'FeatureCollection', features: features }, {
        renderer: L.canvas(),
        style: {
          color: '#2E7D32',
          weight: 1,
          fillColor: '#8BC34A',
          fillOpacity: 0.18
        }
      });
      geoLayer.addLayer(layer);
      if (drawMode) return;
      try {
        map.fitBounds(layer.getBounds().pad(0.08), { animate: false, maxZoom: 13 });
      } catch (e) {}
    }

    function highlight(feature) {
      if (selectedLayer) {
        map.removeLayer(selectedLayer);
        selectedLayer = null;
      }
      if (!feature) return;
      selectedLayer = L.geoJSON(feature, {
        style: {
          color: '#F9A825',
          weight: 3,
          fillColor: '#F9A825',
          fillOpacity: 0.4
        }
      }).addTo(map);
    }
  </script>
</body>
</html>`;
}

export function jsSetPolygons(collection: FeatureCollection): string {
  const payload = JSON.stringify(collection.features ?? []);
  return `setPolygons(${payload}); true;`;
}

export function jsSetUser(latitude: number, longitude: number): string {
  return `setUser(${latitude}, ${longitude}); true;`;
}

export function jsFlyTo(latitude: number, longitude: number, longitudeDelta: number, latitudeDelta?: number): string {
  const latDelta = latitudeDelta ?? longitudeDelta;
  return `flyTo(${latitude}, ${longitude}, ${latDelta}, ${longitudeDelta}); true;`;
}

export function jsHighlight(feature: unknown): string {
  return `highlight(${JSON.stringify(feature)}); true;`;
}

export function jsSetImagery(imagery: 'satellite' | 'street'): string {
  return `setImagery(${JSON.stringify(imagery)}); true;`;
}

export function jsSetDrawMode(enabled: boolean): string {
  return `setDrawMode(${enabled ? 'true' : 'false'}); true;`;
}

export function jsSetDraft(points: Array<{ latitude: number; longitude: number }>): string {
  return `setDraft(${JSON.stringify(points)}); true;`;
}

export function jsUndoDraft(): string {
  return `undoDraft(); true;`;
}

export function jsClearDraft(): string {
  return `clearDraft(); true;`;
}
