(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.ReactSphereViewer = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*!
 * Photo Sphere Viewer 3.1.0
 * Copyright (c) 2014-2015 Jérémy Heleine
 * Copyright (c) 2015-2016 Damien "Mistic" Sorel
 * Licensed under MIT (http://opensource.org/licenses/MIT)
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['three'], factory);
  }
  else {
    root.PhotoSphereViewer = factory(window.THREE);
  }
}(this, function(THREE) {
"use strict";

/**
 * Viewer class
 * @param options (Object) Viewer settings
 */
function PhotoSphereViewer(options) {
  if (!(this instanceof PhotoSphereViewer)) {
    return new PhotoSphereViewer(options);
  }

  if (options === undefined || options.panorama === undefined || options.container === undefined) {
    throw new PSVError('no value given for panorama or container');
  }

  this.config = PSVUtils.deepmerge(PhotoSphereViewer.DEFAULTS, options);

  // normalize config
  this.config.min_fov = PSVUtils.stayBetween(this.config.min_fov, 1, 179);
  this.config.max_fov = PSVUtils.stayBetween(this.config.max_fov, 1, 179);
  this.config.tilt_up_max = PSVUtils.stayBetween(this.config.tilt_up_max, -PhotoSphereViewer.HalfPI, PhotoSphereViewer.HalfPI);
  this.config.tilt_down_max = PSVUtils.stayBetween(this.config.tilt_down_max, -PhotoSphereViewer.HalfPI, PhotoSphereViewer.HalfPI);
  if (this.config.default_fov === null) {
    this.config.default_fov = this.config.max_fov;
  }
  else {
    this.config.default_fov = PSVUtils.stayBetween(this.config.default_fov, this.config.min_fov, this.config.max_fov);
  }
  if (this.config.anim_lat === null) {
    this.config.anim_lat = this.config.default_lat;
  }
  this.config.anim_lat = PSVUtils.stayBetween(this.config.anim_lat, -PhotoSphereViewer.HalfPI, PhotoSphereViewer.HalfPI);

  if (this.config.tilt_up_max < this.config.tilt_down_max) {
    throw new PSVError('tilt_up_max cannot be lower than tilt_down_max');
  }

  if (this.config.caption && !this.config.navbar) {
    this.config.navbar = 'caption';
  }

  // references to components
  this.parent = (typeof this.config.container == 'string') ? document.getElementById(this.config.container) : this.config.container;
  this.container = null;
  this.loader = null;
  this.navbar = null;
  this.hud = null;
  this.panel = null;
  this.tooltip = null;
  this.canvas_container = null;
  this.renderer = null;
  this.scene = null;
  this.camera = null;
  this.mesh = null;
  this.raycaster = null;
  this.actions = {};

  // local properties
  this.prop = {
    fps: 60,
    latitude: 0,
    longitude: 0,
    anim_speed: 0,
    zoom_lvl: 0,
    moving: false,
    zooming: false,
    start_mouse_x: 0,
    start_mouse_y: 0,
    mouse_x: 0,
    mouse_y: 0,
    pinch_dist: 0,
    direction: null,
    autorotate_timeout: null,
    animation_timeout: null,
    start_timeout: null,
    size: {
      width: 0,
      height: 0,
      ratio: 0,
      image_width: 0,
      image_height: 0
    }
  };

  // compute zoom level
  this.prop.zoom_lvl = Math.round((this.config.default_fov - this.config.min_fov) / (this.config.max_fov - this.config.min_fov) * 100);
  this.prop.zoom_lvl -= 2 * (this.prop.zoom_lvl - 50);

  // create actual container
  this.container = document.createElement('div');
  this.container.classList.add('psv-container');
  this.parent.appendChild(this.container);

  // init
  this.setAnimSpeed(this.config.anim_speed);

  this.rotate(this.config.default_long, this.config.default_lat);

  if (this.config.size !== null) {
    this._setViewerSize(this.config.size);
  }

  if (this.config.autoload) {
    this.load();
  }
}

PhotoSphereViewer.PI = Math.PI;
PhotoSphereViewer.TwoPI = Math.PI * 2.0;
PhotoSphereViewer.HalfPI = Math.PI / 2.0;

PhotoSphereViewer.MOVE_THRESHOLD = 4;

PhotoSphereViewer.ICONS = {};

/**
 * PhotoSphereViewer defaults
 */
PhotoSphereViewer.DEFAULTS = {
  panorama: null,
  container: null,
  caption: null,
  autoload: true,
  usexmpdata: true,
  min_fov: 30,
  max_fov: 90,
  default_fov: null,
  default_long: 0,
  default_lat: 0,
  tilt_up_max: PhotoSphereViewer.HalfPI,
  tilt_down_max: -PhotoSphereViewer.HalfPI,
  long_offset: Math.PI / 1440.0,
  lat_offset: Math.PI / 720.0,
  time_anim: 2000,
  anim_speed: '2rpm',
  anim_lat: null,
  navbar: false,
  tooltip: {
    offset: 5,
    arrow_size: 7
  },
  lang: {
    autorotate: 'Automatic rotation',
    zoom: 'Zoom',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    download: 'Download',
    fullscreen: 'Fullscreen',
    markers: 'Markers'
  },
  mousewheel: true,
  mousemove: true,
  loading_img: null,
  loading_txt: 'Loading...',
  size: null,
  markers: []
};

/**
 * Destroy the viewer
 */
PhotoSphereViewer.prototype.destroy = function() {
  // remove listeners
  window.removeEventListener('resize', this);
  document.removeEventListener(PSVUtils.fullscreenEvent(), this);

  if (this.config.mousemove) {
    this.hud.container.removeEventListener('mousedown', this);
    this.hud.container.removeEventListener('touchstart', this);
    window.removeEventListener('mouseup', this);
    window.removeEventListener('touchend', this);
    this.hud.container.removeEventListener('mousemove', this);
    this.hud.container.removeEventListener('touchmove', this);
  }

  if (this.config.mousewheel) {
    this.hud.container.removeEventListener(PSVUtils.mouseWheelEvent(), this);
  }

  // destroy components
  if (this.hud) this.hud.destroy();
  if (this.loader) this.loader.destroy();
  if (this.navbar) this.navbar.destroy();
  if (this.panel) this.panel.destroy();
  if (this.tooltip) this.tooltip.destroy();

  // destroy ThreeJS view
  if (this.scene) {
    this.scene.remove(this.camera);
    this.scene.remove(this.mesh);
  }

  if (this.mesh) {
    if (this.mesh.material) {
      if (this.mesh.material.geometry) this.mesh.material.geometry.dispose();
      if (this.mesh.material.map) this.mesh.material.map.dispose();
      this.mesh.material.dispose();
    }
  }

  // remove container
  if (this.canvas_container) {
    this.container.removeChild(this.canvas_container);
  }
  this.parent.removeChild(this.container);

  // clean references
  this.container = null;
  this.loader = null;
  this.navbar = null;
  this.hud = null;
  this.panel = null;
  this.tooltip = null;
  this.canvas_container = null;
  this.renderer = null;
  this.scene = null;
  this.camera = null;
  this.mesh = null;
  this.raycaster = null;
  this.actions = {};
};

/**
 * Starts to load the panorama
 * @return (void)
 */
PhotoSphereViewer.prototype.load = function() {
  this.container.classList.add('loading');

  // Is canvas supported?
  if (!PSVUtils.isCanvasSupported()) {
    this.container.textContent = 'Canvas is not supported, update your browser!';
    return;
  }

  // Loader
  this.loader = new PSVLoader(this);

  // Canvas container
  this.canvas_container = document.createElement('div');
  this.canvas_container.className = 'psv-canvas-container';
  this.container.appendChild(this.canvas_container);

  // load image
  if (this.config.usexmpdata) {
    this._loadXMP();
  }
  else {
    this._loadTexture(false, false);
  }
};

/**
 * Loads the XMP data with AJAX
 * @return (void)
 */
PhotoSphereViewer.prototype._loadXMP = function() {
  if (!window.XMLHttpRequest) {
    this.container.textContent = 'XHR is not supported, update your browser!';
    return;
  }

  var xhr = new XMLHttpRequest();
  var self = this;
  var progress = 0;

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200 || xhr.status === 201 || xhr.status === 202 || xhr.status === 0) {
        self.loader.setProgress(100);

        var binary = xhr.responseText;
        var a = binary.indexOf('<x:xmpmeta'), b = binary.indexOf('</x:xmpmeta>');
        var data = binary.substring(a, b);

        // No data retrieved
        if (a === -1 || b === -1 || data.indexOf('GPano:') === -1) {
          self._loadTexture(false, true);
          return;
        }

        var pano_data = {
          full_width: parseInt(PSVUtils.getXMPValue(data, 'FullPanoWidthPixels')),
          full_height: parseInt(PSVUtils.getXMPValue(data, 'FullPanoHeightPixels')),
          cropped_width: parseInt(PSVUtils.getXMPValue(data, 'CroppedAreaImageWidthPixels')),
          cropped_height: parseInt(PSVUtils.getXMPValue(data, 'CroppedAreaImageHeightPixels')),
          cropped_x: parseInt(PSVUtils.getXMPValue(data, 'CroppedAreaLeftPixels')),
          cropped_y: parseInt(PSVUtils.getXMPValue(data, 'CroppedAreaTopPixels'))
        };

        self._loadTexture(pano_data, true);
      }
      else {
        self.container.textContent = 'Cannot load image';
      }
    }
    else if (xhr.readyState === 3) {
      self.loader.setProgress(progress + 10);
    }
  };

  xhr.onprogress = function(e) {
    if (e.lengthComputable) {
      var new_progress = parseInt(e.loaded / e.total * 100);
      if (new_progress > progress) {
        progress = new_progress;
        self.loader.setProgress(progress);
      }
    }
  };

  xhr.onerror = function() {
    self.container.textContent = 'Cannot load image';
  };

  xhr.open('GET', this.config.panorama, true);
  xhr.send(null);
};

/**
 * Loads the sphere texture
 * @param pano_data (mixed) An object containing the panorama XMP data (false if it there is not)
 * @param in_cache (boolean) If the image has already been loaded and should be in cache
 * @return (void)
 */
PhotoSphereViewer.prototype._loadTexture = function(pano_data, in_cache) {
  var loader = new THREE.ImageLoader();
  var self = this;
  var progress = in_cache ? 100 : 0;

  // CORS when the panorama is not given as a base64 string
  if (!this.config.panorama.match(/^data:image\/[a-z]+;base64/)) {
    loader.setCrossOrigin('anonymous');
  }

  var onload = function(img) {
    self.loader.setProgress(100);

    // Default XMP data
      pano_data = {
        full_width: img.width,
        full_height: img.height,
        cropped_width: img.width,
        cropped_height: img.height,
        cropped_x: 0,
        cropped_y: 0
      };

    // Size limit for mobile compatibility
    var max_width = 4096;
    if (PSVUtils.isWebGLSupported()) {
      max_width = PSVUtils.getMaxTextureWidth();
    }

    var new_width = Math.min(pano_data.full_width, max_width);
    var r = new_width / pano_data.full_width;

    pano_data.full_width *= r;
    pano_data.full_height *= r;
    pano_data.cropped_width *= r;
    pano_data.cropped_height *= r;
    pano_data.cropped_x *= r;
    pano_data.cropped_y *= r;

    img.width = pano_data.cropped_width;
    img.height = pano_data.cropped_height;

    // Create buffer
    var buffer = document.createElement('canvas');
    buffer.width = pano_data.full_width;
    buffer.height = pano_data.full_height;

    var ctx = buffer.getContext('2d');
    ctx.drawImage(img, pano_data.cropped_x, pano_data.cropped_y, pano_data.cropped_width, pano_data.cropped_height);

    self.prop.size.image_width = pano_data.cropped_width;
    self.prop.size.image_height = pano_data.cropped_height;

    self._createScene(buffer);
  };

  var onprogress = function(e) {
    if (e.lengthComputable) {
      var new_progress = parseInt(e.loaded / e.total * 100);
      if (new_progress > progress) {
        progress = new_progress;
        self.loader.setProgress(progress);
      }
    }
  };

  var onerror = function() {
    self.container.textContent = 'Cannot load image';
  };

  loader.load(this.config.panorama, onload, onprogress, onerror);
};

/**
 * Creates the 3D scene and GUI compoents
 * @param img (Canvas) The sphere texture
 * @return (void)
 */
PhotoSphereViewer.prototype._createScene = function(img) {
  this._onResize();

  this.raycaster = new THREE.Raycaster();

  // Renderer depends on whether WebGL is supported or not
  this.renderer = PSVUtils.isWebGLSupported() ? new THREE.WebGLRenderer({preserveDrawingBuffer: true}) : new THREE.CanvasRenderer();
  this.renderer.setSize(this.prop.size.width, this.prop.size.height);

  this.camera = new THREE.PerspectiveCamera(this.config.default_fov, this.prop.size.ratio, 1, 300);
  this.camera.position.set(0, 0, 0);

  this.scene = new THREE.Scene();
  this.scene.add(this.camera);

  var texture = new THREE.Texture(img);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  // The middle of the panorama is placed at longitude=0
  var geometry = new THREE.SphereGeometry(200, 32, 32, -PhotoSphereViewer.HalfPI);
  var material = new THREE.MeshBasicMaterial({ map: texture, overdraw: true });
  material.side = THREE.DoubleSide;
  this.mesh = new THREE.Mesh(geometry, material);
  this.mesh.scale.x = -1;

  this.scene.add(this.mesh);
  this.canvas_container.appendChild(this.renderer.domElement);

  // Remove loader
  this.loader.destroy();
  this.loader = null;
  this.container.classList.remove('loading');

  // Navigation bar
  if (this.config.navbar) {
    this.container.classList.add('has-navbar');
    this.navbar = new PSVNavBar(this);
  }

  // HUD
  this.hud = new PSVHUD(this);
  this.config.markers.forEach(function(marker) {
    this.hud.addMarker(marker, false);
  }, this);

  // Panel
  this.panel = new PSVPanel(this);

  // Tooltip
  this.tooltip = new PSVTooltip(this);

  // Queue animation
  if (this.config.time_anim !== false) {
    this.prop.start_timeout = setTimeout(this.startAutorotate.bind(this), this.config.time_anim);
  }

  this._bindEvents();
  this.trigger('ready');
  this.render();
};

/**
 * Add all needed event listeners
 * @return (void)
 */
PhotoSphereViewer.prototype._bindEvents = function() {
  window.addEventListener('resize', this);
  document.addEventListener(PSVUtils.fullscreenEvent(), this);

  // all interation events are binded to the HUD only
  if (this.config.mousemove) {
    this.hud.container.style.cursor = 'move';
    this.hud.container.addEventListener('mousedown', this);
    this.hud.container.addEventListener('touchstart', this);
    window.addEventListener('mouseup', this);
    window.addEventListener('touchend', this);
    this.hud.container.addEventListener('mousemove', this);
    this.hud.container.addEventListener('touchmove', this);
  }

  if (this.config.mousewheel) {
    this.hud.container.addEventListener(PSVUtils.mouseWheelEvent(), this);
  }
};

/**
 * Handle events
 * @param e (Event)
 */
PhotoSphereViewer.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'resize':      this._onResize();       break;
    case 'mousedown':   this._onMouseDown(e);   break;
    case 'touchstart':  this._onTouchStart(e);  break;
    case 'mouseup':     this._onMouseUp(e);     break;
    case 'touchend':    this._onTouchEnd(e);    break;
    case 'mousemove':   this._onMouseMove(e);   break;
    case 'touchmove':   this._onTouchMove(e);   break;
    case PSVUtils.fullscreenEvent():  this._fullscreenToggled();  break;
    case PSVUtils.mouseWheelEvent():  this._onMouseWheel(e);      break;
    // @formatter:on
  }
};

/**
 * Renders an image
 * @return (void)
 */
PhotoSphereViewer.prototype.render = function() {
  this.prop.direction = new THREE.Vector3(
    -Math.cos(this.prop.latitude) * Math.sin(this.prop.longitude),
    Math.sin(this.prop.latitude),
    Math.cos(this.prop.latitude) * Math.cos(this.prop.longitude)
  );

  this.camera.lookAt(this.prop.direction);
  this.renderer.render(this.scene, this.camera);
  this.trigger('render');
};

/**
 * Internal method for automatic infinite rotation
 * @return (void)
 */
PhotoSphereViewer.prototype._autorotate = function() {
  // Rotates the sphere && Returns to the equator (latitude = 0)
  this.rotate(
    this.prop.longitude + this.prop.anim_speed / this.prop.fps,
    this.prop.latitude - (this.prop.latitude - this.config.anim_lat) / 200
  );

  this.prop.autorotate_timeout = setTimeout(this._autorotate.bind(this), 1000 / this.prop.fps);
};

/**
 * Starts the autorotate animation
 * @return (void)
 */
PhotoSphereViewer.prototype.startAutorotate = function() {
  clearTimeout(this.prop.start_timeout);
  this.prop.start_timeout = null;

  this.stopAnimation();

  this._autorotate();
  this.trigger('autorotate', true);
};

/**
 * Stops the autorotate animation
 * @return (void)
 */
PhotoSphereViewer.prototype.stopAutorotate = function() {
  clearTimeout(this.prop.start_timeout);
  this.prop.start_timeout = null;

  clearTimeout(this.prop.autorotate_timeout);
  this.prop.autorotate_timeout = null;

  this.trigger('autorotate', false);
};

/**
 * Launches/stops the autorotate animation
 * @return (void)
 */
PhotoSphereViewer.prototype.toggleAutorotate = function() {
  if (this.prop.autorotate_timeout) {
    this.stopAutorotate();
  }
  else {
    this.startAutorotate();
  }
};

/**
 * Resizes the canvas when the window is resized
 * @return (void)
 */
PhotoSphereViewer.prototype._onResize = function() {
  if (this.container.clientWidth != this.prop.size.width || this.container.clientHeight != this.prop.size.height) {
    this.resize(this.container.clientWidth, this.container.clientHeight);
  }
};

/**
 * Resizes the canvas
 * @param width (integer) The new canvas width
 * @param height (integer) The new canvas height
 * @return (void)
 */
PhotoSphereViewer.prototype.resize = function(width, height) {
  this.prop.size.width = parseInt(width);
  this.prop.size.height = parseInt(height);
  this.prop.size.ratio = this.prop.size.width / this.prop.size.height;

  if (this.camera) {
    this.camera.aspect = this.prop.size.ratio;
    this.camera.updateProjectionMatrix();
  }

  if (this.renderer) {
    this.renderer.setSize(this.prop.size.width, this.prop.size.height);
    this.render();
  }

  this.trigger('size-updated', this.prop.size.width, this.prop.size.height);
};

/**
 * The user wants to move
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._onMouseDown = function(evt) {
  this._startMove(evt);
};

/**
 * The user wants to move (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._onTouchStart = function(evt) {
  if (evt.touches.length === 1) {
    this._startMove(evt.touches[0]);
  }
  else if (evt.touches.length === 2) {
    this._startZoom(evt);
  }
};

/**
 * Initializes the movement
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._startMove = function(evt) {
  this.prop.mouse_x = this.prop.start_mouse_x = parseInt(evt.clientX);
  this.prop.mouse_y = this.prop.start_mouse_y = parseInt(evt.clientY);
  this.prop.moving = true;
  this.prop.moved = false;
  this.prop.zooming = false;

  this.stopAutorotate();
  this.stopAnimation();
};

/**
 * Initializes the zoom
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._startZoom = function(evt) {
  var t = [
    { x: parseInt(evt.touches[0].clientX), y: parseInt(evt.touches[0].clientY) },
    { x: parseInt(evt.touches[1].clientX), y: parseInt(evt.touches[1].clientY) }
  ];

  this.prop.pinch_dist = Math.sqrt(Math.pow(t[0].x - t[1].x, 2) + Math.pow(t[0].y - t[1].y, 2));
  this.prop.moving = false;
  this.prop.zooming = true;

  this.stopAutorotate();
  this.stopAnimation();
};

/**
 * The user wants to stop moving
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._onMouseUp = function(evt) {
  this._stopMove(evt);
};

/**
 * The user wants to stop moving (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._onTouchEnd = function(evt) {
  this._stopMove(evt.changedTouches[0]);
};

/**
 * Stops the movement
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._stopMove = function(evt) {
  if (this.prop.moving) {
    if (Math.abs(evt.clientX - this.prop.start_mouse_x) < PhotoSphereViewer.MOVE_THRESHOLD && Math.abs(evt.clientY - this.prop.start_mouse_y) < PhotoSphereViewer.MOVE_THRESHOLD) {
      this._click(evt);
    }
    else {
      this.prop.moved = true;
    }
  }

  this.prop.moving = false;
  this.prop.zooming = false;
};

/**
 * Trigger an event with all coordinates when a simple click is performed
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._click = function(evt) {
  this.trigger('_click', evt);
  if (evt.defaultPrevented) {
    return;
  }

  var boundingRect = this.container.getBoundingClientRect();

  var data = {
    client_x: parseInt(evt.clientX - boundingRect.left),
    client_y: parseInt(evt.clientY - boundingRect.top)
  };

  var screen = new THREE.Vector2(
    2 * data.client_x / this.prop.size.width - 1,
    -2 * data.client_y / this.prop.size.height + 1
  );

  this.raycaster.setFromCamera(screen, this.camera);

  var intersects = this.raycaster.intersectObjects(this.scene.children);

  if (intersects.length === 1) {
    var p = intersects[0].point;
    var phi = Math.acos(p.y / Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z));
    var theta = Math.atan2(p.x, p.z);

    data.longitude = theta < 0 ? -theta : PhotoSphereViewer.TwoPI - theta;
    data.latitude = PhotoSphereViewer.HalfPI - phi;

    var relativeLong = data.longitude / PhotoSphereViewer.TwoPI * this.prop.size.image_width;
    var relativeLat = data.latitude / PhotoSphereViewer.PI * this.prop.size.image_height;

    data.texture_x = parseInt(data.longitude < PhotoSphereViewer.PI ? relativeLong + this.prop.size.image_width / 2 : relativeLong - this.prop.size.image_width / 2);
    data.texture_y = parseInt(this.prop.size.image_height / 2 - relativeLat);

    this.trigger('click', data);
  }
};

/**
 * The user moves the image
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._onMouseMove = function(evt) {
  evt.preventDefault();
  this._move(evt);
};

/**
 * The user moves the image (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._onTouchMove = function(evt) {
  if (evt.touches.length === 1) {
    evt.preventDefault();
    this._move(evt.touches[0]);
  }
  else if (evt.touches.length === 2) {
    evt.preventDefault();
    this._zoom(evt);
  }
};

/**
 * Movement
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._move = function(evt) {
  if (this.prop.moving) {
    var x = parseInt(evt.clientX);
    var y = parseInt(evt.clientY);

    this.rotate(
      this.prop.longitude - (x - this.prop.mouse_x) * this.config.long_offset,
      this.prop.latitude + (y - this.prop.mouse_y) * this.config.lat_offset
    );

    this.prop.mouse_x = x;
    this.prop.mouse_y = y;
  }
};

/**
 * Zoom
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._zoom = function(evt) {
  if (this.prop.zooming) {
    var t = [
      { x: parseInt(evt.touches[0].clientX), y: parseInt(evt.touches[0].clientY) },
      { x: parseInt(evt.touches[1].clientX), y: parseInt(evt.touches[1].clientY) }
    ];

    var p = Math.sqrt(Math.pow(t[0].x - t[1].x, 2) + Math.pow(t[0].y - t[1].y, 2));
    var delta = 80 * (p - this.prop.pinch_dist) / this.prop.size.width;

    this.zoom(this.prop.zoom_lvl + delta);

    this.prop.pinch_dist = p;
  }
};

/**
 * Rotate the camera
 * @param t (double) Horizontal angle (rad)
 * @param p (double) Vertical angle (rad)
 * @return (void)
 */
PhotoSphereViewer.prototype.rotate = function(t, p) {
  this.prop.longitude = t - Math.floor(t / PhotoSphereViewer.TwoPI) * PhotoSphereViewer.TwoPI;
  this.prop.latitude = PSVUtils.stayBetween(p, this.config.tilt_down_max, this.config.tilt_up_max);

  if (this.renderer) {
    this.render();
  }

  this.trigger('position-updated', this.prop.longitude, this.prop.latitude);
};

/**
 * Rotate the camera with animation
 * @param t (double) Horizontal angle (rad)
 * @param p (double) Vertical angle (rad)
 * @param s (mixed) Optional. Animation speed or duration (milliseconds)
 * @return (void)
 */
PhotoSphereViewer.prototype.animate = function(t, p, s) {
  if (!s) {
    this.rotate(t, p);
    return;
  }

  t = t - Math.floor(t / PhotoSphereViewer.TwoPI) * PhotoSphereViewer.TwoPI;
  p = PSVUtils.stayBetween(p, this.config.tilt_down_max, this.config.tilt_up_max);

  var t0 = this.prop.longitude;
  var p0 = this.prop.latitude;

  // get duration of animation
  var duration;
  if (s && typeof s === 'number') {
    duration = s / 1000;
  }
  else {
    // desired radial speed
    var speed = s ? this._parseAnimSpeed(s) : this.prop.anim_speed;
    // get the angle between current position and target
    var angle = Math.acos(Math.cos(p0) * Math.cos(p) * Math.cos(t0 - t) + Math.sin(p0) * Math.sin(p));
    duration = angle / speed;
  }

  var steps = duration * this.prop.fps;

  // longitude offset for shortest arc
  var tCandidates = [
    t - t0, // direct
    PhotoSphereViewer.TwoPI - t0 + t, // clock-wise cross zero
    t - t0 - PhotoSphereViewer.TwoPI // counter-clock-wise cross zero
  ];

  var tOffset = tCandidates.reduce(function(value, candidate) {
    return Math.abs(candidate) < Math.abs(value) ? candidate : value;
  }, Infinity);

  // latitude offset
  var pOffset = p - p0;

  this.stopAutorotate();
  this.stopAnimation();

  this._animate(tOffset / steps, pOffset / steps, t, p);
};

/**
 * Internal method for animation
 * @param tStep (double) horizontal angle to move the view each tick
 * @param pStep (double) vertical angle to move the view each tick
 * @param tTarget (double) target horizontal angle
 * @param pTarget (double) target vertical angle
 * @return (void)
 */
PhotoSphereViewer.prototype._animate = function(tStep, pStep, tTarget, pTarget) {
  if (tStep !== 0 && Math.abs(this.prop.longitude - tTarget) <= Math.abs(tStep) * 2) {
    tStep = 0;
    this.prop.longitude = tTarget;
  }
  if (pStep !== 0 && Math.abs(this.prop.latitude - pTarget) <= Math.abs(pStep) * 2) {
    pStep = 0;
    this.prop.latitude = pTarget;
  }

  this.rotate(
    this.prop.longitude + tStep,
    this.prop.latitude + pStep
  );

  if (tStep !== 0 || pStep !== 0) {
    this.prop.animation_timeout = setTimeout(this._animate.bind(this, tStep, pStep, tTarget, pTarget), 1000 / this.prop.fps);
  }
  else {
    this.stopAnimation();
  }
};

/**
 * Stop the ongoing animation
 * @return (void)
 */
PhotoSphereViewer.prototype.stopAnimation = function() {
  clearTimeout(this.prop.animation_timeout);
  this.prop.animation_timeout = null;
};

/**
 * The user wants to zoom
 * @param evt (Event) The event
 * @return (void)
 */
PhotoSphereViewer.prototype._onMouseWheel = function(evt) {
  evt.preventDefault();
  evt.stopPropagation();

  var delta = evt.deltaY !== undefined ? -evt.deltaY : (evt.wheelDelta !== undefined ? evt.wheelDelta : -evt.detail);

  if (delta !== 0) {
    var direction = parseInt(delta / Math.abs(delta));
    this.zoom(this.prop.zoom_lvl + direction);
  }
};

/**
 * Zoom
 * @paramlevel (integer) New zoom level
 * @return (void)
 */
PhotoSphereViewer.prototype.zoom = function(level) {
  this.prop.zoom_lvl = PSVUtils.stayBetween(parseInt(Math.round(level)), 0, 100);

  this.camera.fov = this.config.max_fov + (this.prop.zoom_lvl / 100) * (this.config.min_fov - this.config.max_fov);
  this.camera.updateProjectionMatrix();
  this.render();

  this.trigger('zoom-updated', this.prop.zoom_lvl);
};

/**
 * Zoom in
 * @return (void)
 */
PhotoSphereViewer.prototype.zoomIn = function() {
  if (this.prop.zoom_lvl < 100) {
    this.zoom(this.prop.zoom_lvl + 1);
  }
};

/**
 * Zoom out
 * @return (void)
 */
PhotoSphereViewer.prototype.zoomOut = function() {
  if (this.prop.zoom_lvl > 0) {
    this.zoom(this.prop.zoom_lvl - 1);
  }
};

/**
 * Fullscreen state has changed
 * @return (void)
 */
PhotoSphereViewer.prototype._fullscreenToggled = function() {
  this.trigger('fullscreen-updated', PSVUtils.isFullscreenEnabled());
};

/**
 * Enables/disables fullscreen
 * @return (void)
 */
PhotoSphereViewer.prototype.toggleFullscreen = function() {
  if (!PSVUtils.isFullscreenEnabled()) {
    PSVUtils.requestFullscreen(this.container);
  }
  else {
    PSVUtils.exitFullscreen();
  }
};

/**
 * Parse the animation speed
 * @param speed (string) The speed, in radians/degrees/revolutions per second/minute
 * @return (double) radians per second
 */
PhotoSphereViewer.prototype._parseAnimSpeed = function(speed) {
  speed = speed.toString().trim();

  // Speed extraction
  var speed_value = parseFloat(speed.replace(/^(-?[0-9]+(?:\.[0-9]*)?).*$/, '$1'));
  var speed_unit = speed.replace(/^-?[0-9]+(?:\.[0-9]*)?(.*)$/, '$1').trim();

  // "per minute" -> "per second"
  if (speed_unit.match(/(pm|per minute)$/)) {
    speed_value /= 60;
  }

  var rad_per_second = 0;

  // Which unit?
  switch (speed_unit) {
    // Degrees per minute / second
    case 'dpm':
    case 'degrees per minute':
    case 'dps':
    case 'degrees per second':
      rad_per_second = speed_value * Math.PI / 180;
      break;

    // Radians per minute / second
    case 'radians per minute':
    case 'radians per second':
      rad_per_second = speed_value;
      break;

    // Revolutions per minute / second
    case 'rpm':
    case 'revolutions per minute':
    case 'rps':
    case 'revolutions per second':
      rad_per_second = speed_value * PhotoSphereViewer.TwoPI;
      break;

    // Unknown unit
    default:
      throw new PSVError('unknown speed unit "' + speed_unit + '"');
  }

  return rad_per_second;
};

/**
 * Sets the animation speed
 * @param speed (string) The speed, in radians/degrees/revolutions per second/minute
 * @return (void)
 */
PhotoSphereViewer.prototype.setAnimSpeed = function(speed) {
  this.prop.anim_speed = this._parseAnimSpeed(speed);
};

/**
 * Sets the viewer size
 * @param size (Object) An object containing the wanted width and height
 * @return (void)
 */
PhotoSphereViewer.prototype._setViewerSize = function(size) {
  ['width', 'height'].forEach(function(dim) {
    if (size[dim]) {
      if (/^[0-9.]+$/.test(size[dim])) size[dim] += 'px';
      this.parent.style[dim] = size[dim];
    }
  }, this);
};

/**
 * Adds an event listener
 * If "func" is an object, its "handleEvent" method will be called with an object as paremeter
 *    - type: name of the event prefixed with "psv:"
 *    - args: array of action arguments
 * @param name (string) Action name
 * @param func (Function|Object) The handler function, or an object with an "handleEvent" method
 * @return (void)
 */
PhotoSphereViewer.prototype.on = function(name, func) {
  if (!(name in this.actions)) {
    this.actions[name] = [];
  }

  this.actions[name].push(func);
};

/**
 * Removes an event listener
 * @param name (string) Action name
 * @param func (Function|Object)
 */
PhotoSphereViewer.prototype.off = function(name, func) {
  if (name in this.actions) {
    var idx = this.actions[name].indexOf(func);
    if (idx !== -1) {
      this.actions[name].splice(idx, 1);
    }
  }
};

/**
 * Triggers an action
 * @param name (string) Action name
 * @param args... (mixed) Arguments to send to the handler functions
 * @return (void)
 */
PhotoSphereViewer.prototype.trigger = function(name, args) {
  args = Array.prototype.slice.call(arguments, 1);
  if ((name in this.actions) && this.actions[name].length > 0) {
    this.actions[name].forEach(function(func) {
      if (typeof func === 'object') {
        func.handleEvent({
          type: 'psv:' + name,
          args: args
        });
      }
      else {
        func.apply(this, args);
      }
    }, this);
  }
};


/**
 * Base sub-component class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVComponent(psv) {
  this.psv = psv;
  this.container = null;

  // expose some methods to the viewer
  if (this.constructor.publicMethods) {
    this.constructor.publicMethods.forEach(function(method) {
      this.psv[method] = this[method].bind(this);
    }, this);
  }
}

/**
 * Creates the component
 */
PSVComponent.prototype.create = function() {
  this.container = document.createElement('div');

  this.psv.container.appendChild(this.container);
};

/**
 * Destroys the component
 */
PSVComponent.prototype.destroy = function() {
  this.psv.container.removeChild(this.container);

  this.container = null;
  this.psv = null;
};


/**
 * Loader class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVLoader(psv) {
  this.psv = psv;
  this.container = null;
  this.canvas = null;

  this.create();
}

/**
 * Creates the loader content
 */
PSVLoader.prototype.create = function() {
  this.container = document.createElement('div');
  this.container.className = 'psv-loader';

  this.psv.container.appendChild(this.container);

  this.canvas = document.createElement('canvas');
  this.canvas.className = 'loader-canvas';

  this.canvas.width = this.container.clientWidth;
  this.canvas.height = this.container.clientWidth;
  this.container.appendChild(this.canvas);

  this.tickness = (this.container.offsetWidth - this.container.clientWidth) / 2;

  var inner;
  if (this.psv.config.loading_img) {
    inner = document.createElement('img');
    inner.className = 'loader-image';
    inner.src = this.psv.config.loading_img;
  }
  else if (this.psv.config.loading_txt) {
    inner = document.createElement('div');
    inner.className = 'loader-text';
    inner.innerHTML = this.psv.config.loading_txt;
  }
  if (inner) {
    var a = Math.round(Math.sqrt(2 * Math.pow(this.canvas.width / 2 - this.tickness / 2, 2)));
    inner.style.maxWidth = a + 'px';
    inner.style.maxHeight = a + 'px';
    this.container.appendChild(inner);
  }
};

/**
 * Destroys the loader
 */
PSVLoader.prototype.destroy = function() {
  this.psv.container.removeChild(this.container);

  this.psv = null;
  this.container = null;
};

/**
 * Sets the loader progression
 * @param value (int) from 0 to 100
 */
PSVLoader.prototype.setProgress = function(value) {
  var context = this.canvas.getContext('2d');

  context.clearRect(0, 0, this.canvas.width, this.canvas.height);

  context.lineWidth = this.tickness;
  context.strokeStyle = PSVUtils.getStyle(this.container, 'color');

  context.beginPath();
  context.arc(
    this.canvas.width / 2, this.canvas.height / 2,
    this.canvas.width / 2 - this.tickness / 2,
    -Math.PI / 2, value / 100 * 2 * Math.PI - Math.PI / 2
  );
  context.stroke();
};


/**
 * HUD class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVHUD(psv) {
  PSVComponent.call(this, psv);

  this.markers = {};
  this.currentMarker = null;

  this.create();
}

PSVHUD.prototype = Object.create(PSVComponent.prototype);
PSVHUD.prototype.constructor = PSVHUD;

PSVHUD.publicMethods = ['addMarker', 'removeMarker', 'updateMarker', 'getMarker', 'getCurrentMarker', 'gotoMarker', 'hideMarker', 'showMarker', 'toggleMarker'];

/**
 * Creates the HUD
 * @return (void)
 */
PSVHUD.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.container.className = 'psv-hud';

  // Markers events via delegation
  this.container.addEventListener('mouseenter', this, true);
  this.container.addEventListener('mouseleave', this, true);

  // Viewer events
  this.psv.on('_click', this);
  this.psv.on('render', this);
};

/**
 * Destroys the HUD
 */
PSVHUD.prototype.destroy = function() {
  this.container.removeEventListener('mouseenter', this);
  this.container.removeEventListener('mouseleave', this);

  this.psv.off('_click', this);
  this.psv.off('render', this);

  PSVComponent.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVHUD.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'mouseenter': this._onMouseEnter(e); break;
    case 'mouseleave': this._onMouseLeave(e); break;
    case 'psv:_click': this._onClick(e.args[0]); break;
    case 'psv:render': this.updatePositions(); break;
    // @formatter:on
  }
};

/**
 * Add a new marker to HUD
 * @param marker (Object)
 * @param render (Boolean) "false" to disable immediate render
 * @return (Object) a modified marker object
 */
PSVHUD.prototype.addMarker = function(marker, render) {
  if (!marker.id) {
    throw new PSVError('missing marker id');
  }

  if (this.markers[marker.id]) {
    throw new PSVError('marker "' + marker.id + '" already exists');
  }

  if (!marker.image && !marker.html) {
    throw new PSVError('missing marker image/html');
  }

  if (marker.image && (!marker.width || !marker.height)) {
    throw new PSVError('missing marker width/height');
  }

  if ((!marker.hasOwnProperty('x') || !marker.hasOwnProperty('y')) && (!marker.hasOwnProperty('latitude') || !marker.hasOwnProperty('longitude'))) {
    throw new PSVError('missing marker position, latitude/longitude or x/y');
  }

  // create DOM
  marker.$el = document.createElement('div');
  marker.$el.id = 'psv-marker-' + marker.id;
  marker.$el.className = 'psv-marker';

  this.markers[marker.id] = marker; // will be replaced by updateMarker
  this.container.appendChild(marker.$el);

  return this.updateMarker(PSVUtils.clone(marker), render);

};

/**
 * Get a marker by it's id or external object
 * @param marker (Mixed)
 * @return (Object)
 */
PSVHUD.prototype.getMarker = function(marker) {
  var id = typeof marker === 'object' ? marker.id : marker;

  if (!this.markers[id]) {
    throw new PSVError('cannot find marker "' + id + '"');
  }

  return this.markers[id];
};

/**
 * Get the current selected marker
 * @return (Object)
 */
PSVHUD.prototype.getCurrentMarker = function() {
  return this.currentMarker;
};

/**
 * Update a marker
 * @param marker (Object)
 * @param render (Boolean) "false" to disable immediate render
 * @return (Object) a modified marker object
 */
PSVHUD.prototype.updateMarker = function(marker, render) {
  var old = this.getMarker(marker);

  // clean some previous data
  if (old.className) {
    old.$el.classList.remove(old.className);
  }
  if (old.tooltip) {
    old.$el.classList.remove('has-tooltip');
  }

  // merge objects
  delete marker.$el;
  marker = PSVUtils.deepmerge(old, marker);

  marker.position2D = null;

  // add classes
  if (marker.className) {
    marker.$el.classList.add(marker.className);
  }
  if (marker.tooltip) {
    marker.$el.classList.add('has-tooltip');
    if (typeof marker.tooltip === 'string') {
      marker.tooltip = { content: marker.tooltip };
    }
  }

  // set image
  var style = marker.$el.style;

  if (marker.width && marker.height) {
    style.width = marker.width + 'px';
    style.height = marker.height + 'px';
    marker.dynamicSize = false;
  }
  else {
    marker.dynamicSize = true;
  }

  if (marker.style) {
    Object.getOwnPropertyNames(marker.style).forEach(function(prop) {
      style[prop] = marker.style[prop];
    });
  }

  if (marker.image) {
    style.backgroundImage = 'url(' + marker.image + ')';
  }
  else {
    marker.$el.innerHTML = marker.html;
  }

  // parse anchor
  marker.anchor = PSVUtils.parsePosition(marker.anchor);

  // convert texture coordinates to spherical coordinates
  if (marker.hasOwnProperty('x') && marker.hasOwnProperty('y')) {
    var relativeX = marker.x / this.psv.prop.size.image_width * PhotoSphereViewer.TwoPI;
    var relativeY = marker.y / this.psv.prop.size.image_height * PhotoSphereViewer.PI;

    marker.longitude = relativeX >= PhotoSphereViewer.PI ? relativeX - PhotoSphereViewer.PI : relativeX + PhotoSphereViewer.PI;
    marker.latitude = PhotoSphereViewer.HalfPI - relativeY;
  }

  // compute x/y/z position
  marker.position3D = new THREE.Vector3(
    -Math.cos(marker.latitude) * Math.sin(marker.longitude),
    Math.sin(marker.latitude),
    Math.cos(marker.latitude) * Math.cos(marker.longitude)
  );

  if (!marker.hasOwnProperty('visible')) {
    marker.visible = true;
  }

  // save
  marker.$el.psvMarker = marker;
  this.markers[marker.id] = marker;

  if (render !== false) {
    this.updatePositions();
  }

  return marker;
};

/**
 * Remove a marker
 * @param marker (Mixed)
 * @param render (Boolean) "false" to disable immediate render
 * @return (void)
 */
PSVHUD.prototype.removeMarker = function(marker, render) {
  marker = this.getMarker(marker);

  marker.$el.parentNode.removeChild(marker.$el);
  delete this.markers[marker.id];

  if (render !== false) {
    this.updatePositions();
  }
};

/**
 * Go to a specific marker
 * @param marker (Mixed)
 * @param duration (Mixed)
 * @return (void)
 */
PSVHUD.prototype.gotoMarker = function(marker, duration) {
  marker = this.getMarker(marker);
  this.psv.animate(marker.longitude, marker.latitude, duration);
};

/**
 * Hide a marker
 * @param marker (Mixed)
 * @return (void)
 */
PSVHUD.prototype.hideMarker = function(marker) {
  this.getMarker(marker).visible = false;
  this.updatePositions();
};

/**
 * Show a marker
 * @param marker (Mixed)
 * @return (void)
 */
PSVHUD.prototype.showMarker = function(marker) {
  this.getMarker(marker).visible = true;
  this.updatePositions();
};

/**
 * Toggle a marker
 * @param marker (Mixed)
 * @return (void)
 */
PSVHUD.prototype.toggleMarker = function(marker) {
  this.getMarker(marker).visible ^= true;
  this.updatePositions();
};

/**
 * Update visibility and position of all markers
 * @return (void)
 */
PSVHUD.prototype.updatePositions = function() {
  this.psv.camera.updateProjectionMatrix();

  for (var id in this.markers) {
    var marker = this.markers[id];
    var position = this._getMarkerPosition(marker);

    if (this._isMarkerVisible(marker, position)) {
      marker.position2D = position;

      marker.$el.style.transform = 'translate3D(' +
        position.left + 'px, ' +
        position.top + 'px, ' +
        '0px)';

      if (!marker.$el.classList.contains('visible')) {
        marker.$el.classList.add('visible');
      }
    }
    else {
      marker.position2D = null;
      marker.$el.classList.remove('visible');
    }
  }
};

/**
 * Determine if a marker is visible
 * It tests if the point is in the general direction of the camera, then check if it's in the viewport
 * @param marker (Object)
 * @param position (Object)
 * @return (Boolean)
 */
PSVHUD.prototype._isMarkerVisible = function(marker, position) {
  return marker.visible &&
    marker.position3D.dot(this.psv.prop.direction) > 0 &&
    position.left + marker.width >= 0 &&
    position.left - marker.width <= this.psv.prop.size.width &&
    position.top + marker.height >= 0 &&
    position.top - marker.height <= this.psv.prop.size.height;
};

/**
 * Compute HUD coordinates of a marker
 * @param marker (Object)
 * @return (Object) top and left position
 */
PSVHUD.prototype._getMarkerPosition = function(marker) {
  if (marker.dynamicSize) {
    // make the marker visible to get it's size
    marker.$el.classList.add('transparent');
    var rect = marker.$el.getBoundingClientRect();
    marker.$el.classList.remove('transparent');

    marker.width = rect.right - rect.left;
    marker.height = rect.bottom - rect.top;
  }

  var vector = marker.position3D.clone();
  vector.project(this.psv.camera);

  return {
    top: (1 - vector.y) / 2 * this.psv.prop.size.height - marker.height * marker.anchor.top,
    left: (vector.x + 1) / 2 * this.psv.prop.size.width - marker.width * marker.anchor.left
  };
};

/**
 * The mouse enters a marker : show the tooltip
 * @param e (Event)
 * @return (void)
 */
PSVHUD.prototype._onMouseEnter = function(e) {
  if (e.target && e.target.psvMarker && e.target.psvMarker.tooltip) {
    var marker = e.target.psvMarker;
    this.psv.tooltip.showTooltip({
      content: marker.tooltip.content,
      position: marker.tooltip.position,
      top: marker.position2D.top,
      left: marker.position2D.left,
      marker: marker
    });
  }
};

/**
 * The mouse leaves a marker : hide the tooltip
 * @param e (Event)
 * @return (void)
 */
PSVHUD.prototype._onMouseLeave = function(e) {
  if (e.target && e.target.psvMarker) {
    this.psv.tooltip.hideTooltip();
  }
};

/**
 * The mouse button is release : show/hide the panel if threshold was not reached, or do nothing
 * @param e (Event)
 * @return (void)
 */
PSVHUD.prototype._onClick = function(e) {
  if (!this.psv.prop.moved) {
    var marker;
    if (e.target && (marker = PSVUtils.getClosest(e.target, '.psv-marker')) && marker.psvMarker) {
      this.currentMarker = marker.psvMarker;
      this.psv.trigger('select-marker', marker.psvMarker);
      e.preventDefault(); // prevent the public "click" event
    }
    else if (this.currentMarker) {
      this.currentMarker = null;
      this.psv.trigger('unselect-marker');
    }

    if (marker && marker.psvMarker && marker.psvMarker.content) {
      this.psv.panel.showPanel(marker.psvMarker.content);
    }
    else if (this.psv.panel.prop.opened) {
      e.preventDefault(); // prevent the public "click" event
      this.psv.panel.hidePanel();
    }
  }
};


/*jshint multistr: true */

/**
 * Panel class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVPanel(psv) {
  PSVComponent.call(this, psv);

  this.content = null;

  this.prop = {
    mouse_x: 0,
    mouse_y: 0,
    mousedown: false,
    opened: false
  };

  this.create();
}

PSVPanel.prototype = Object.create(PSVComponent.prototype);
PSVPanel.prototype.constructor = PSVPanel;

PSVPanel.publicMethods = ['showPanel', 'hidePanel'];

/**
 * Creates the panel
 * @return (void)
 */
PSVPanel.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.container.className = 'psv-panel';
  this.container.innerHTML = '\
<div class="resizer"></div>\
<div class="close-button"></div>\
<div class="content"></div>';

  this.content = this.container.querySelector('.content');

  var closeBtn = this.container.querySelector('.close-button');
  closeBtn.addEventListener('click', this.hidePanel.bind(this));

  // Stop event bubling from panel
  if (this.psv.config.mousewheel) {
    this.container.addEventListener(PSVUtils.mouseWheelEvent(), function(e) {
      e.stopPropagation();
    });
  }

  // Event for panel resizing + stop bubling
  var resizer = this.container.querySelector('.resizer');
  resizer.addEventListener('mousedown', this);
  resizer.addEventListener('touchstart', this);
  this.psv.container.addEventListener('mouseup', this);
  this.psv.container.addEventListener('touchend', this);
  this.psv.container.addEventListener('mousemove', this);
  this.psv.container.addEventListener('touchmove', this);
};

/**
 * Destroys the panel
 */
PSVPanel.prototype.destroy = function() {
  this.psv.container.removeEventListener('mousemove', this);
  this.psv.container.removeEventListener('touchmove', this);
  this.psv.container.removeEventListener('mouseup', this);
  this.psv.container.removeEventListener('touchend', this);

  PSVComponent.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVPanel.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'mousedown': this._onMouseDown(e); break;
    case 'touchstart': this._onTouchStart(e); break;
    case 'mousemove': this._onMouseMove(e); break;
    case 'touchmove': this._onMouseMove(e); break;
    case 'mouseup': this._onMouseUp(e); break;
    case 'touchend': this._onMouseUp(e); break;
    // @formatter:on
  }
};

/**
 * Show the panel
 * @param marker (Object)
 * @param noMargin (Boolean)
 * @return (void)
 */
PSVPanel.prototype.showPanel = function(content, noMargin) {
  this.content.innerHTML = content;
  this.content.scrollTop = 0;
  this.container.classList.add('open');

  if (noMargin) {
    if (!this.content.classList.contains('no-margin')) {
      this.content.classList.add('no-margin');
    }
  }
  else {
    this.content.classList.remove('no-margin');
  }

  this.prop.opened = true;
  this.psv.trigger('open-panel');
};


/**
 * Hide the panel
 * @return (void)
 */
PSVPanel.prototype.hidePanel = function() {
  this.prop.opened = false;
  this.container.classList.remove('open');
  this.psv.trigger('close-panel');
};

/**
 * The user wants to move
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onMouseDown = function(evt) {
  evt.stopPropagation();
  this._startResize(evt);
};

/**
 * The user wants to move (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onTouchStart = function(evt) {
  evt.stopPropagation();
  this._startResize(evt.changedTouches[0]);
};

/**
 * Initializes the movement
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._startResize = function(evt) {
  this.prop.mouse_x = parseInt(evt.clientX);
  this.prop.mouse_y = parseInt(evt.clientY);
  this.prop.mousedown = true;
  this.content.classList.add('no-interaction');
};

/**
 * The user wants to stop moving
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onMouseUp = function(evt) {
  if (this.prop.mousedown) {
    evt.stopPropagation();
    this.prop.mousedown = false;
    this.content.classList.remove('no-interaction');
  }
};

/**
 * The user resizes the panel
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onMouseMove = function(evt) {
  if (this.prop.mousedown) {
    evt.stopPropagation();
    this._resize(evt);
  }
};

/**
 * The user resizes the panel (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._onTouchMove = function(evt) {
  if (this.prop.mousedown) {
    evt.stopPropagation();
    this._resize(evt.changedTouches[0]);
  }
};

/**
 * Panel resizing
 * @param evt (Event) The event
 * @return (void)
 */
PSVPanel.prototype._resize = function(evt) {
  var x = parseInt(evt.clientX);
  var y = parseInt(evt.clientY);

  this.container.style.width = (this.container.offsetWidth - (x - this.prop.mouse_x)) + 'px';

  this.prop.mouse_x = x;
  this.prop.mouse_y = y;
};


/**
 * Tooltip class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVTooltip(psv) {
  PSVComponent.call(this, psv);

  this.config = this.psv.config.tooltip;

  this.create();
}

PSVTooltip.prototype = Object.create(PSVComponent.prototype);
PSVTooltip.prototype.constructor = PSVTooltip;

PSVTooltip.publicMethods = ['showTooltip', 'hideTooltip'];

PSVTooltip.leftMap = { 0: 'left', 0.5: 'center', 1: 'right' };
PSVTooltip.topMap = { 0: 'top', 0.5: 'center', 1: 'bottom' };

/**
 * Creates the tooltip
 * @return (void)
 */
PSVTooltip.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.container.innerHTML = '<div class="arrow"></div><div class="content"></div>';
  this.container.className = 'psv-tooltip';
  this.container.style.top = '-1000px';
  this.container.style.left = '-1000px';

  this.psv.on('render', this);
};

/**
 * Destroys the tooltip
 */
PSVTooltip.prototype.destroy = function() {
  this.psv.off('render', this);

  PSVComponent.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVTooltip.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'psv:render': this.hideTooltip(); break;
    // @formatter:on
  }
};

/**
 * Show the tooltip
 * @param config (Object)
 *    - content
 *    - top
 *    - left
 *    - position (default: 'top center')
 *    - className (optional)
 *    - marker (optional) -- take marker dimensions in account when positioning the tooltip
 * @return (void)
 */
PSVTooltip.prototype.showTooltip = function(config) {
  var t = this.container;
  var c = t.querySelector('.content');
  var a = t.querySelector('.arrow');

  if (!config.position) {
    config.position = ['top', 'center'];
  }

  if (!config.marker) {
    config.marker = {
      width: 0,
      height: 0
    };
  }

  // parse position
  if (typeof config.position === 'string') {
    var tempPos = PSVUtils.parsePosition(config.position);

    if (!(tempPos.left in PSVTooltip.leftMap) || !(tempPos.top in PSVTooltip.topMap)) {
      throw new PSVError('unable to parse tooltip position "' + tooltip.position + '"');
    }

    config.position = [PSVTooltip.topMap[tempPos.top], PSVTooltip.leftMap[tempPos.left]];
  }

  if (config.position[0] == 'center' && config.position[1] == 'center') {
    throw new PSVError('unable to parse tooltip position "center center"');
  }

  t.className = 'psv-tooltip'; // reset the class
  if (config.className) {
    t.classList.add(config.className);
  }

  c.innerHTML = config.content;
  t.style.top = '0px';
  t.style.left = '0px';

  // compute size
  var rect = t.getBoundingClientRect();
  var style = {
    posClass: config.position.slice(),
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    top: 0,
    left: 0,
    arrow_top: 0,
    arrow_left: 0
  };

  // set initial position
  this._computeTooltipPosition(style, config);

  // correct position if overflow
  var refresh = false;
  if (style.top < this.config.offset) {
    style.posClass[0] = 'bottom';
    refresh = true;
  }
  else if (style.top + style.height > this.psv.prop.size.height - this.config.offset) {
    style.posClass[0] = 'top';
    refresh = true;
  }
  if (style.left < this.config.offset) {
    style.posClass[1] = 'right';
    refresh = true;
  }
  else if (style.left + style.width > this.psv.prop.size.width - this.config.offset) {
    style.posClass[1] = 'left';
    refresh = true;
  }
  if (refresh) {
    this._computeTooltipPosition(style, config);
  }

  // apply position
  t.style.top = style.top + 'px';
  t.style.left = style.left + 'px';

  a.style.top = style.arrow_top + 'px';
  a.style.left = style.arrow_left + 'px';

  t.classList.add(style.posClass.join('-'));

  // delay for correct transition between the two classes
  var self = this;
  setTimeout(function() {
    t.classList.add('visible');
    self.psv.trigger('show-tooltip');
  }, 100);
};

/**
 * Hide the tooltip
 * @return (void)
 */
PSVTooltip.prototype.hideTooltip = function() {
  this.container.classList.remove('visible');
  this.psv.trigger('hide-tooltip');

  var self = this;
  setTimeout(function() {
    self.container.style.top = '-1000px';
    self.container.style.left = '-1000px';
  }, 100);
};

/**
 * Compute the position of the tooltip and its arrow
 * @param style (Object)
 * @param config (Object)
 * @return (void)
 */
PSVTooltip.prototype._computeTooltipPosition = function(style, config) {
  var topBottom = false;

  switch (style.posClass[0]) {
    case 'bottom':
      style.top = config.top + config.marker.height + this.config.offset + this.config.arrow_size;
      style.arrow_top = -this.config.arrow_size * 2;
      topBottom = true;
      break;

    case 'center':
      style.top = config.top + config.marker.height / 2 - style.height / 2;
      style.arrow_top = style.height / 2 - this.config.arrow_size;
      break;

    case 'top':
      style.top = config.top - style.height - this.config.offset - this.config.arrow_size;
      style.arrow_top = style.height;
      topBottom = true;
      break;
  }

  switch (style.posClass[1]) {
    case 'right':
      if (topBottom) {
        style.left = config.left;
        style.arrow_left = config.marker.width / 2 - this.config.arrow_size;
      }
      else {
        style.left = config.left + config.marker.width + this.config.offset + this.config.arrow_size;
        style.arrow_left = -this.config.arrow_size * 2;
      }
      break;

    case 'center':
      style.left = config.left + config.marker.width / 2 - style.width / 2;
      style.arrow_left = style.width / 2 - this.config.arrow_size;
      break;

    case 'left':
      if (topBottom) {
        style.left = config.left - style.width + config.marker.width;
        style.arrow_left = style.width - config.marker.width / 2 - this.config.arrow_size;
      }
      else {
        style.left = config.left - style.width - this.config.offset - this.config.arrow_size;
        style.arrow_left = style.width;
      }
      break;
  }
};


/**
 * Navigation bar class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVNavBar(psv) {
  PSVComponent.call(this, psv);

  this.config = this.psv.config.navbar;
  this.caption = null;
  this.buttons = [];

  if (this.config === true) {
    this.config = PSVUtils.clone(PSVNavBar.DEFAULTS);
  }
  else if (typeof this.config == 'string') {
    var map = {};
    Object.keys(PSVNavBar.DEFAULTS).forEach(function(button) {
      map[button] = this.config.indexOf(button) !== -1;
    }, this);
    this.config = map;
  }

  this.create();
}

PSVNavBar.prototype = Object.create(PSVComponent.prototype);
PSVNavBar.prototype.constructor = PSVNavBar;

PSVNavBar.publicMethods = ['setCaption'];

PSVNavBar.DEFAULTS = {
  autorotate: true,
  zoom: true,
  fullscreen: true,
  download: true,
  markers: true
};

/**
 * Creates the navbar
 * @return (void)
 */
PSVNavBar.prototype.create = function() {
  PSVComponent.prototype.create.call(this);

  this.container.className = 'psv-navbar';

  // Autorotate button
  if (this.config.autorotate) {
    this.buttons.push(new PSVNavBarAutorotateButton(this));
  }

  // Zoom buttons
  if (this.config.zoom) {
    this.buttons.push(new PSVNavBarZoomButton(this));
  }

  // Download button
  if (this.config.download) {
    this.buttons.push(new PSVNavBarDownloadButton(this));
  }

  // Markers button
  if (this.config.markers) {
    this.buttons.push(new PSVNavBarMarkersButton(this));
  }

  // Fullscreen button
  if (this.config.fullscreen) {
    this.buttons.push(new PSVNavBarFullscreenButton(this));
  }

  // Caption
  this.caption = document.createElement('div');
  this.caption.className = 'caption';
  this.container.appendChild(this.caption);
  this.setCaption(this.psv.config.caption);
};

/**
 * Destroys the navbar
 */
PSVNavBar.prototype.destroy = function() {
  this.buttons.forEach(function(button) {
    button.destroy();
  });

  this.buttons.length = 0;

  PSVComponent.prototype.destroy.call(this);
};

/**
 * Sets the bar caption
 * @param (string) html
 */
PSVNavBar.prototype.setCaption = function(html) {
  if (!html) {
    this.caption.style.display = 'none';
  }
  else {
    this.caption.style.display = 'block';
    this.caption.innerHTML = html;
  }
};


/**
 * Navigation bar button class
 * @param navbar (PSVNavBar) A PSVNavBar object
 */
function PSVNavBarButton(navbar) {
  this.navbar = navbar;
  this.psv = navbar.psv;
  this.button = null;
}

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarButton.prototype.create = function() {
  this.button = document.createElement('div');
  this.button.className = 'psv-button';
  this.navbar.container.appendChild(this.button);
};

/**
 * Destroys the button
 */
PSVNavBarButton.prototype.destroy = function() {
  this.navbar.container.removeChild(this.button);

  this.navbar = null;
  this.psv = null;
  this.button = null;
};

/**
 * Changes the active state of the button
 * @param active (boolean) true if the button should be active, false otherwise
 * @return (void)
 */
PSVNavBarButton.prototype.toggleActive = function(active) {
  if (active) {
    this.button.classList.add('active');
  }
  else {
    this.button.classList.remove('active');
  }
};


/**
 * Navigation bar autorotate button class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVNavBarAutorotateButton(psv) {
  PSVNavBarButton.call(this, psv);

  this.create();
}

PSVNavBarAutorotateButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarAutorotateButton.prototype.constructor = PSVNavBarAutorotateButton;

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarAutorotateButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.button.classList.add('autorotate-button');
  this.button.title = this.psv.config.lang.autorotate;

  var autorotate_sphere = document.createElement('div');
  autorotate_sphere.className = 'sphere';
  this.button.appendChild(autorotate_sphere);

  var autorotate_equator = document.createElement('div');
  autorotate_equator.className = 'equator';
  this.button.appendChild(autorotate_equator);

  this.button.addEventListener('click', this.psv.toggleAutorotate.bind(this.psv));

  this.psv.on('autorotate', this.toggleActive.bind(this));
};


/**
 * Navigation bar fullscreen button class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVNavBarFullscreenButton(psv) {
  PSVNavBarButton.call(this, psv);

  this.create();
}

PSVNavBarFullscreenButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarFullscreenButton.prototype.constructor = PSVNavBarFullscreenButton;

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarFullscreenButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.button.classList.add('fullscreen-button');
  this.button.title = this.psv.config.lang.fullscreen;

  this.button.appendChild(document.createElement('div'));
  this.button.appendChild(document.createElement('div'));

  this.button.addEventListener('click', this.psv.toggleFullscreen.bind(this.psv));

  this.psv.on('fullscreen-updated', this);
};

/**
 * Destroys the button
 */
PSVNavBarFullscreenButton.prototype.destroy = function() {
  this.psv.off('fullscreen-updated', this);

  PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarFullscreenButton.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'psv:fullscreen-updated': this.toggleActive(); break;
    // @formatter:on
  }
};


/**
 * Navigation bar zoom button class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVNavBarZoomButton(psv) {
  PSVNavBarButton.call(this, psv);

  this.zoom_range = null;
  this.zoom_value = null;

  this.prop = {
    mousedown: false
  };

  this.create();
}

PSVNavBarZoomButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarZoomButton.prototype.constructor = PSVNavBarZoomButton;

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarZoomButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.button.classList.add('zoom-button');

  var zoom_minus = document.createElement('div');
  zoom_minus.className = 'minus';
  zoom_minus.title = this.psv.config.lang.zoomOut;
  zoom_minus.innerHTML = PhotoSphereViewer.ICONS['zoom-out.svg'];
  this.button.appendChild(zoom_minus);

  var zoom_range_bg = document.createElement('div');
  zoom_range_bg.className = 'range';
  this.button.appendChild(zoom_range_bg);

  this.zoom_range = document.createElement('div');
  this.zoom_range.className = 'line';
  this.zoom_range.title = this.psv.config.lang.zoom;
  zoom_range_bg.appendChild(this.zoom_range);

  this.zoom_value = document.createElement('div');
  this.zoom_value.className = 'handle';
  this.zoom_value.title = this.psv.config.lang.zoom;
  this.zoom_range.appendChild(this.zoom_value);

  var zoom_plus = document.createElement('div');
  zoom_plus.className = 'plus';
  zoom_plus.title = this.psv.config.lang.zoomIn;
  zoom_plus.innerHTML = PhotoSphereViewer.ICONS['zoom-in.svg'];
  this.button.appendChild(zoom_plus);

  this.zoom_range.addEventListener('mousedown', this);
  this.zoom_range.addEventListener('touchstart', this);
  this.psv.container.addEventListener('mousemove', this);
  this.psv.container.addEventListener('touchmove', this);
  this.psv.container.addEventListener('mouseup', this);
  this.psv.container.addEventListener('touchend', this);
  zoom_minus.addEventListener('click', this.psv.zoomOut.bind(this.psv));
  zoom_plus.addEventListener('click', this.psv.zoomIn.bind(this.psv));

  this.psv.on('zoom-updated', this);

  var self = this;
  setTimeout(function() {
    self._moveZoomValue(self.psv.prop.zoom_lvl);
  }, 0);
};

/**
 * Destroys the button
 */
PSVNavBarZoomButton.prototype.destroy = function() {
  this.psv.container.removeEventListener('mousemove', this);
  this.psv.container.removeEventListener('touchmove', this);
  this.psv.container.removeEventListener('mouseup', this);
  this.psv.container.removeEventListener('touchend', this);

  this.psv.off('zoom-updated', this);

  PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarZoomButton.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'mousedown': this._initZoomChangeWithMouse(e); break;
    case 'touchstart': this._initZoomChangeByTouch(e); break;
    case 'mousemove': this._changeZoomWithMouse(e); break;
    case 'touchmove': this._changeZoomByTouch(e); break;
    case 'mouseup': this._stopZoomChange(e); break;
    case 'touchend': this._stopZoomChange(e); break;
    case 'psv:zoom-updated': this._moveZoomValue(e.args[0]); break;
    // @formatter:on
  }
};

/**
 * Moves the zoom cursor
 * @param level (integer) Zoom level (between 0 and 100)
 * @return (void)
 */
PSVNavBarZoomButton.prototype._moveZoomValue = function(level) {
  this.zoom_value.style.left = (level / 100 * this.zoom_range.offsetWidth - this.zoom_value.offsetWidth / 2) + 'px';
};

/**
 * The user wants to zoom
 * @param evt (Event) The event
 * @return (void)
 */
PSVNavBarZoomButton.prototype._initZoomChangeWithMouse = function(evt) {
  this.prop.mousedown = true;
  this._changeZoom(evt.clientX);
};

/**
 * The user wants to zoom (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PSVNavBarZoomButton.prototype._initZoomChangeByTouch = function(evt) {
  this.prop.mousedown = true;
  this._changeZoom(evt.changedTouches[0].clientX);
};

/**
 * The user wants to stop zooming
 * @param evt (Event) The event
 * @return (void)
 */
PSVNavBarZoomButton.prototype._stopZoomChange = function(evt) {
  this.prop.mousedown = false;
};

/**
 * The user moves the zoom cursor
 * @param evt (Event) The event
 * @return (void)
 */
PSVNavBarZoomButton.prototype._changeZoomWithMouse = function(evt) {
  evt.preventDefault();
  this._changeZoom(evt.clientX);
};

/**
 * The user moves the zoom cursor (mobile version)
 * @param evt (Event) The event
 * @return (void)
 */
PSVNavBarZoomButton.prototype._changeZoomByTouch = function(evt) {
  evt.preventDefault();
  this._changeZoom(evt.changedTouches[0].clientX);
};

/**
 * Zoom change
 * @param x (integer) Horizontal coordinate
 * @return (void)
 */
PSVNavBarZoomButton.prototype._changeZoom = function(x) {
  if (this.prop.mousedown) {
    var user_input = parseInt(x) - this.zoom_range.getBoundingClientRect().left;
    var zoom_level = user_input / this.zoom_range.offsetWidth * 100;
    this.psv.zoom(zoom_level);
  }
};


/**
 * Navigation bar download button class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVNavBarDownloadButton(psv) {
  PSVNavBarButton.call(this, psv);

  this.create();
}

PSVNavBarDownloadButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarDownloadButton.prototype.constructor = PSVNavBarDownloadButton;

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarDownloadButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.button.classList.add('download-button');
  this.button.title = this.psv.config.lang.download;

  this.button.appendChild(document.createElement('div'));

  this.button.addEventListener('mouseenter', this.toggleActive.bind(this, true));
  this.button.addEventListener('mouseleave', this.toggleActive.bind(this, false));
  this.button.addEventListener('click', this.download.bind(this));
};

/**
 * Ask the browser to download the panorama source file
 */
PSVNavBarDownloadButton.prototype.download = function() {
  var link = document.createElement('a');
  link.href = this.psv.config.panorama;
  link.download = this.psv.config.panorama;
  this.psv.container.appendChild(link);
  link.click();
};


/**
 * Navigation bar markers button class
 * @param psv (PhotoSphereViewer) A PhotoSphereViewer object
 */
function PSVNavBarMarkersButton(psv) {
  PSVNavBarButton.call(this, psv);

  this.prop = {
    panelOpened: false,
    panelOpening: false
  };

  this.create();
}

PSVNavBarMarkersButton.prototype = Object.create(PSVNavBarButton.prototype);
PSVNavBarMarkersButton.prototype.constructor = PSVNavBarMarkersButton;

/**
 * Creates the button
 * @return (void)
 */
PSVNavBarMarkersButton.prototype.create = function() {
  PSVNavBarButton.prototype.create.call(this);

  this.button.classList.add('markers-button');
  this.button.title = this.psv.config.lang.markers;
  this.button.innerHTML = PhotoSphereViewer.ICONS['pin.svg'];

  this.button.addEventListener('click', this.toggleMarkers.bind(this));

  this.psv.on('open-panel', this);
  this.psv.on('close-panel', this);
};

/**
 * Destroys the button
 */
PSVNavBarMarkersButton.prototype.destroy = function() {
  this.psv.off('open-panel', this);
  this.psv.off('close-panel', this);

  PSVNavBarButton.prototype.destroy.call(this);
};

/**
 * Handle events
 * @param e (Event)
 */
PSVNavBarMarkersButton.prototype.handleEvent = function(e) {
  switch (e.type) {
    // @formatter:off
    case 'psv:open-panel': this._onPanelOpened(); break;
    case 'psv:close-panel': this._onPanelClosed(); break;
    // @formatter:on
  }
};

/**
 * Toggle the visibility of markers list
 * @return (void)
 */
PSVNavBarMarkersButton.prototype.toggleMarkers = function() {
  if (this.prop.panelOpened) {
    this.hideMarkers();
  }
  else {
    this.showMarkers();
  }
};

/**
 * Open side panel with list of markers
 * @return (void)
 */
PSVNavBarMarkersButton.prototype.showMarkers = function() {
  var html = '<div class="psv-markers-list">'
    + '<h1>' + this.psv.config.lang.markers + '</h1>'
    + '<ul>';

  for (var id in this.psv.hud.markers) {
    var marker = this.psv.hud.markers[id];

    var name = marker.id;
    if (marker.html) {
      name = marker.html;
    }
    else if (marker.tooltip) {
      name = typeof marker.tooltip === 'string' ? marker.tooltip : marker.tooltip.content;
    }

    html += '<li data-psv-marker="' + marker.id + '">';
    if (marker.image) {
      html += '<img src="' + marker.image + '"/>';
    }
    html += '<p>' + name + '</p>'
      + '</li>';
  }

  html += '</ul>'
    + '</div>';

  this.prop.panelOpening = true;
  this.psv.panel.showPanel(html, true);

  this.psv.panel.container.querySelector('.psv-markers-list').addEventListener('click', this._onClickItem.bind(this));
};

/**
 * Close side panel
 * @return (void)
 */
PSVNavBarMarkersButton.prototype.hideMarkers = function() {
  this.psv.panel.hidePanel();
};

/**
 * Click on an item
 * @param e (Event)
 * @return (void)
 */
PSVNavBarMarkersButton.prototype._onClickItem = function(e) {
  var li;
  if (e.target && (li = PSVUtils.getClosest(e.target, 'li')) && li.dataset.psvMarker) {
    this.psv.hud.gotoMarker(li.dataset.psvMarker, 1000);
    this.psv.panel.hidePanel();
  }
};

/**
 * Update status when the panel is updated
 * @return (void)
 */
PSVNavBarMarkersButton.prototype._onPanelOpened = function() {
  if (this.prop.panelOpening) {
    this.prop.panelOpening = false;
    this.prop.panelOpened = true;
  }
  else {
    this.prop.panelOpened = false;
  }

  this.toggleActive(this.prop.panelOpened);
};

/**
 * Update status when the panel is updated
 * @return (void)
 */
PSVNavBarMarkersButton.prototype._onPanelClosed = function() {
  this.prop.panelOpened = false;
  this.prop.panelOpening = false;

  this.toggleActive(this.prop.panelOpened);
};


/**
 * Custom error used in the lib
 * http://stackoverflow.com/a/27724419/1207670
 * @param message (Mixed)
 */
function PSVError(message) {
  this.message = message;

  // Use V8's native method if available, otherwise fallback
  if ('captureStackTrace' in Error) {
    Error.captureStackTrace(this, PSVError);
  }
  else {
    this.stack = (new Error()).stack;
  }
}

PSVError.prototype = Object.create(Error.prototype);
PSVError.prototype.name = 'PSVError';
PSVError.prototype.constructor = PSVError;


/**
 * Static utilities for PSV
 */
var PSVUtils = {};

/**
 * Detects whether canvas is supported
 * @return (boolean) true if canvas is supported, false otherwise
 */
PSVUtils.isCanvasSupported = function() {
  var canvas = document.createElement('canvas');
  return !!(canvas.getContext && canvas.getContext('2d'));
};

/**
 * Detects whether WebGL is supported
 * @return (boolean) true if WebGL is supported, false otherwise
 */
PSVUtils.isWebGLSupported = function() {
  var canvas = document.createElement('canvas');
  return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
};

/**
 * Get max texture width in WebGL context
 * @return (int)
 */
PSVUtils.getMaxTextureWidth = function() {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('webgl');
  return ctx.getParameter(ctx.MAX_TEXTURE_SIZE);
};

/**
 * Search if an element has a particular, at any level including itself
 * @param el (HTMLElement)
 * @param parent (HTMLElement)
 * @return (Boolean)
 */
PSVUtils.hasParent = function(el, parent) {
  do {
    if (el === parent) {
      return true;
    }
  } while (!!(el = el.parentNode));

  return false;
};

/**
 * Get closest parent (can by itself)
 * @param el (HTMLElement)
 * @param selector (String)
 * @return (HTMLElement)
 */
PSVUtils.getClosest = function(el, selector) {
  var matches = el.matches || el.msMatchesSelector;

  do {
    if (matches.bind(el)(selector)) {
      return el;
    }
  } while (!!(el = el.parentElement));

  return null;
};

/**
 * Get the event name for mouse wheel
 * @return (string)
 */
PSVUtils.mouseWheelEvent = function() {
  return 'onwheel' in document.createElement('div') ? 'wheel' : // Modern browsers support "wheel"
    document.onmousewheel !== undefined ? 'mousewheel' : // Webkit and IE support at least "mousewheel"
      'DOMMouseScroll'; // let's assume that remaining browsers are older Firefox
};

/**
 * Get the event name for fullscreen event
 * @return (string)
 */
PSVUtils.fullscreenEvent = function() {
  var map = {
    'exitFullscreen': 'fullscreenchange',
    'webkitExitFullscreen': 'webkitfullscreenchange',
    'mozCancelFullScreen': 'mozfullscreenchange',
    'msExitFullscreen': 'msFullscreenEnabled'
  };

  for (var exit in map) {
    if (exit in document) return map[exit];
  }

  return 'fullscreenchange';
};

/**
 * Ensures that a number is in a given interval
 * @param x (number) The number to check
 * @param min (number) First endpoint
 * @param max (number) Second endpoint
 * @return (number) The checked number
 */
PSVUtils.stayBetween = function(x, min, max) {
  return Math.max(min, Math.min(max, x));
};

/**
 * Returns the value of a given attribute in the panorama metadata
 * @param data (string) The panorama metadata
 * @param attr (string) The wanted attribute
 * @return (string) The value of the attribute
 */
PSVUtils.getXMPValue = function(data, attr) {
  var a, b;
  // XMP data are stored in children
  if ((a = data.indexOf('<GPano:' + attr + '>')) !== -1 && (b = data.indexOf('</GPano:' + attr + '>')) !== -1) {
    return data.substring(a, b).replace('<GPano:' + attr + '>', '');
  }
  // XMP data are stored in attributes
  else if ((a = data.indexOf('GPano:' + attr)) !== -1 && (b = data.indexOf('"', a)) !== -1) {
    return data.substring(a + attr.length + 8, b);
  }
  else {
    return null;
  }
};

/**
 * Detects whether fullscreen is enabled or not
 * @return (boolean) true if fullscreen is enabled, false otherwise
 */
PSVUtils.isFullscreenEnabled = function() {
  return (document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
};

/**
 * Enters fullscreen mode
 * @param elt (HTMLElement)
 */
PSVUtils.requestFullscreen = function(elt) {
  (elt.requestFullscreen || elt.mozRequestFullScreen || elt.webkitRequestFullscreen || elt.msRequestFullscreen).call(elt);
};

/**
 * Exits fullscreen mode
 * @param elt (HTMLElement)
 */
PSVUtils.exitFullscreen = function(elt) {
  (document.exitFullscreen || document.mozCancelFullScreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
};

/**
 * Gets an element style
 * @param elt (HTMLElement)
 * @param prop (string)
 * @return mixed
 */
PSVUtils.getStyle = function(elt, prop) {
  return window.getComputedStyle(elt, null)[prop];
};

/**
 * Translate CSS values like "top center" or "10% 50%" as top and left positions
 * @param value (String)
 * @return Object
 */
PSVUtils.parsePosition = function(value) {
  if (!value) {
    return { top: 0.5, left: 0.5 };
  }

  if (typeof value === 'object') {
    return value;
  }

  var e = document.createElement('div');
  document.body.appendChild(e);
  e.style.backgroundPosition = value;
  var parsed = PSVUtils.getStyle(e, 'background-position').match(/^([0-9.]+)% ([0-9.]+)%$/);
  document.body.removeChild(e);

  return {
    left: parsed[1] / 100,
    top: parsed[2] / 100
  };
};

/**
 * Merge the enumerable attributes of two objects.
 * @copyright Nicholas Fisher <nfisher110@gmail.com>"
 * @license MIT
 * @param object
 * @param object
 * @return object
 */
PSVUtils.deepmerge = function(target, src) {
  var array = Array.isArray(src);
  var dst = array && [] || {};

  if (array) {
    target = target || [];
    dst = dst.concat(target);
    src.forEach(function(e, i) {
      if (typeof dst[i] === 'undefined') {
        dst[i] = e;
      }
      else if (typeof e === 'object') {
        dst[i] = PSVUtils.deepmerge(target[i], e);
      }
      else {
        if (target.indexOf(e) === -1) {
          dst.push(e);
        }
      }
    });
  }
  else {
    if (target && typeof target === 'object') {
      Object.keys(target).forEach(function(key) {
        dst[key] = target[key];
      });
    }
    Object.keys(src).forEach(function(key) {
      if (typeof src[key] !== 'object' || !src[key]) {
        dst[key] = src[key];
      }
      else {
        if (!target[key]) {
          dst[key] = src[key];
        }
        else {
          dst[key] = PSVUtils.deepmerge(target[key], src[key]);
        }
      }
    });
  }

  return dst;
};

/**
 * Clone an object
 * @param object
 * @return object
 */
PSVUtils.clone = function(src) {
  return PSVUtils.deepmerge({}, src);
};


PhotoSphereViewer.ICONS['pin.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 48 48" enable-background="new 0 0 48 48" xml:space="preserve"><g><path d="M24,0C13.798,0,5.499,8.3,5.499,18.501c0,10.065,17.57,28.635,18.318,29.421C23.865,47.972,23.931,48,24,48   s0.135-0.028,0.183-0.078c0.748-0.786,18.318-19.355,18.318-29.421C42.501,8.3,34.202,0,24,0z M24,7.139   c5.703,0,10.342,4.64,10.342,10.343c0,5.702-4.639,10.342-10.342,10.342c-5.702,0-10.34-4.64-10.34-10.342   C13.66,11.778,18.298,7.139,24,7.139z"/></g></svg>';

PhotoSphereViewer.ICONS['zoom-in.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 19.407 19.407" enable-background="new 0 0 19.407 19.406" xml:space="preserve"><path d="M14.043,12.22c2.476-3.483,1.659-8.313-1.823-10.789C8.736-1.044,3.907-0.228,1.431,3.255  c-2.475,3.482-1.66,8.312,1.824,10.787c2.684,1.908,6.281,1.908,8.965,0l4.985,4.985c0.503,0.504,1.32,0.504,1.822,0  c0.505-0.503,0.505-1.319,0-1.822L14.043,12.22z M7.738,13.263c-3.053,0-5.527-2.475-5.527-5.525c0-3.053,2.475-5.527,5.527-5.527  c3.05,0,5.524,2.474,5.524,5.527C13.262,10.789,10.788,13.263,7.738,13.263z"/><polygon points="8.728,4.009 6.744,4.009 6.744,6.746 4.006,6.746 4.006,8.73 6.744,8.73 6.744,11.466 8.728,11.466 8.728,8.73   11.465,8.73 11.465,6.746 8.728,6.746 "/></svg>';

PhotoSphereViewer.ICONS['zoom-out.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" x="0px" y="0px" viewBox="0 0 19.407 19.407" enable-background="new 0 0 19.407 19.406" xml:space="preserve"><path d="M14.043,12.22c2.476-3.483,1.659-8.313-1.823-10.789C8.736-1.044,3.907-0.228,1.431,3.255  c-2.475,3.482-1.66,8.312,1.824,10.787c2.684,1.908,6.281,1.908,8.965,0l4.985,4.985c0.503,0.504,1.32,0.504,1.822,0  c0.505-0.503,0.505-1.319,0-1.822L14.043,12.22z M7.738,13.263c-3.053,0-5.527-2.475-5.527-5.525c0-3.053,2.475-5.527,5.527-5.527  c3.05,0,5.524,2.474,5.524,5.527C13.262,10.789,10.788,13.263,7.738,13.263z"/><rect x="4.006" y="6.746" width="7.459" height="1.984"/></svg>';

return PhotoSphereViewer;
}));

},{}],2:[function(require,module,exports){
/*!
 * uEvent - to make any js object an event emitter
 * Copyright 2011 Jerome Etienne (http://jetienne.com)
 * Copyright 2015-2016 Damien "Mistic" Sorel (http://www.strangeplanet.fr)
 * Licensed under MIT (http://opensource.org/licenses/MIT)
 */

(function(root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    }
    else if (typeof define === 'function' && define.amd) {
        define([], factory);
    }
    else {
        root.uEvent = factory();
    }
}(this, function() {
    "use strict";

    var returnTrue = function() {
        return true;
    };
    var returnFalse = function() {
        return false;
    };

    var uEvent = function() {
    };

    /**
     * Event object used to stop propagations and prevent default
     */
    uEvent.Event = function(type, args) {
        var typeReadOnly = type;
        var argsReadonly = args;

        Object.defineProperties(this, {
            'type': {
                get: function() {
                    return typeReadOnly;
                },
                set: function(value) {
                },
                enumerable: true
            },
            'args': {
                get: function() {
                    return argsReadonly;
                },
                set: function(value) {
                },
                enumerable: true
            }
        });
    };

    uEvent.Event.prototype = {
        constructor: uEvent.Event,

        isDefaultPrevented: returnFalse,
        isPropagationStopped: returnFalse,

        preventDefault: function() {
            this.isDefaultPrevented = returnTrue;
        },
        stopPropagation: function() {
            this.isPropagationStopped = returnTrue;
        }
    };

    uEvent.prototype = {
        constructor: uEvent,

        /**
         * Add one or many event handlers
         *
         *  obj.on('event', callback)
         *  obj.on('event', listener) -- listener has an handleEvent method
         *  obj.on('event1 event2', callback)
         *  obj.on({ event1: callback1, event2: callback2 })
         *
         * @param {String,Object} events
         * @param {Function,optional} callback
         * @return {Object} main object
         */
        on: function(events, callback) {
            this.__events = this.__events || {};

            if (typeof events === 'object') {
                for (var event in events) {
                    if (events.hasOwnProperty(event)) {
                        this.__events[event] = this.__events[event] || [];
                        this.__events[event].push(events[event]);
                    }
                }
            }
            else {
                events.split(' ').forEach(function(event) {
                    this.__events[event] = this.__events[event] || [];
                    this.__events[event].push(callback);
                }, this);
            }

            return this;
        },

        /**
         * Remove one or many or all event handlers
         *
         *  obj.off('event')
         *  obj.off('event', callback)
         *  obj.off('event1 event2')
         *  obj.off({ event1: callback1, event2: callback2 })
         *  obj.off()
         *
         * @param {String|Object,optional} events
         * @param {Function,optional} callback
         * @return {Object} main object
         */
        off: function(events, callback) {
            this.__events = this.__events || {};

            if (typeof events === 'object') {
                for (var event in events) {
                    if (events.hasOwnProperty(event) && (event in this.__events)) {
                        var index = this.__events[event].indexOf(events[event]);
                        if (index !== -1) this.__events[event].splice(index, 1);
                    }
                }
            }
            else if (!!events) {
                events.split(' ').forEach(function(event) {
                    if (event in this.__events) {
                        if (callback) {
                            var index = this.__events[event].indexOf(callback);
                            if (index !== -1) this.__events[event].splice(index, 1);
                        }
                        else {
                            this.__events[event].length = 0;
                        }
                    }
                }, this);
            }
            else {
                this.__events = {};
            }

            return this;
        },

        /**
         * Add one or many event handlers that will be called only once
         * This handlers are only applicable to "trigger", not "change"
         *
         *  obj.once('event', callback)
         *  obj.once('event1 event2', callback)
         *  obj.once({ event1: callback1, event2: callback2 })
         *
         * @param {String|Object} events
         * @param {Function,optional} callback
         * @return {Object} main object
         */
        once: function(events, callback) {
            this.__once = this.__once || {};

            if (typeof events === 'object') {
                for (var event in events) {
                    if (events.hasOwnProperty(event)) {
                        this.__once[event] = this.__once[event] || [];
                        this.__once[event].push(events[event]);
                    }
                }
            }
            else {
                events.split(' ').forEach(function(event) {
                    this.__once[event] = this.__once[event] || [];
                    this.__once[event].push(callback);
                }, this);
            }

            return this;
        },

        /**
         * Trigger all handlers for an event
         *
         * @param {String} event name
         * @param {mixed...,optional} arguments
         * @return {uEvent.Event}
         */
        trigger: function(event /* , args... */) {
            var args = Array.prototype.slice.call(arguments, 1);
            var e = new uEvent.Event(event, args);
            var i, l, f;

            args.push(e);

            if (this.__events && event in this.__events) {
                for (i = 0, l = this.__events[event].length; i < l; i++) {
                    f = this.__events[event][i];
                    if (typeof f === 'object') {
                        f.handleEvent(e);
                    }
                    else {
                        f.apply(this, args);
                    }
                    if (e.isPropagationStopped()) {
                        return e;
                    }
                }
            }

            if (this.__once && event in this.__once) {
                for (i = 0, l = this.__once[event].length; i < l; i++) {
                    f = this.__once[event][i];
                    if (typeof f === 'object') {
                        f.handleEvent(e);
                    }
                    else {
                        f.apply(this, args);
                    }
                    if (e.isPropagationStopped()) {
                        delete this.__once[event];
                        return e;
                    }
                }
                delete this.__once[event];
            }

            return e;
        },

        /**
         * Trigger all modificators for an event, each handler must return a value
         *
         * @param {String} event name
         * @param {mixed} event value
         * @param {mixed...,optional} arguments
         * @return {mixed} modified value
         */
        change: function(event, value /* , args... */) {
            var args = Array.prototype.slice.call(arguments, 1);
            var e = new uEvent.Event(event, args);
            var i, l, f;

            args.push(e);

            if (this.__events && event in this.__events) {
                for (i = 0, l = this.__events[event].length; i < l; i++) {
                    args[0] = value;
                    f = this.__events[event][i];
                    if (typeof f === 'object') {
                        value = f.handleEvent(e);
                    }
                    else {
                        value = f.apply(this, args);
                    }
                    if (e.isPropagationStopped()) {
                        return value;
                    }
                }
            }

            return value;
        }
    };

    /**
     * Copy all uEvent functions in the destination object
     *
     * @param {Object} target, the object which will support uEvent
     * @param {Object,optional} names, strings map to rename methods
     */
    uEvent.mixin = function(target, names) {
        names = names || {};
        target = typeof target === 'function' ? target.prototype : target;

        ['on', 'off', 'once', 'trigger', 'change'].forEach(function(name) {
            var method = names[name] || name;
            target[method] = uEvent.prototype[name];
        });

        Object.defineProperties(target, {
            '__events': {
                value: null,
                writable: true
            },
            '__once': {
                value: null,
                writable: true
            }
        });
    };

    return uEvent;
}));

},{}],3:[function(require,module,exports){
(function (global){
'use strict';

Object.defineProperty(exports, '__esModule', {
	value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _react = (typeof window !== "undefined" ? window['React'] : typeof global !== "undefined" ? global['React'] : null);

var _react2 = _interopRequireDefault(_react);

var _photoSphereViewerSa = require('photo-sphere-viewer-sa');

var _uevent = require('uevent');

var _uevent2 = _interopRequireDefault(_uevent);

var ReactSphereViewer = (function (_Component) {
	_inherits(ReactSphereViewer, _Component);

	function ReactSphereViewer() {
		_classCallCheck(this, ReactSphereViewer);

		_get(Object.getPrototypeOf(ReactSphereViewer.prototype), 'constructor', this).apply(this, arguments);
	}

	_createClass(ReactSphereViewer, [{
		key: 'componentWillMount',
		value: function componentWillMount() {
			console.log(_photoSphereViewerSa.PhotoSphereViewer);
		}
	}, {
		key: 'componentDidMount',
		value: function componentDidMount() {
			var _props = this.props;
			var src = _props.src;
			var options = _props.options;

			this.psv = new _photoSphereViewerSa.PhotoSphereViewer(_extends({}, options, { panorama: src }));
		}
	}, {
		key: 'componentWillUnmount',
		value: function componentWillUnmount() {
			this.psv.destroy();
		}
	}, {
		key: 'render',
		value: function render() {
			var container = this.props.options.container;

			return _react2['default'].createElement('div', { id: container });
		}
	}]);

	return ReactSphereViewer;
})(_react.Component);

;
ReactSphereViewer.defaultProps = {
	options: {
		navbar: false,
		gyroscope: false,
		loading_text: 'loading',
		container: 'photosphere',
		navbar: 'autorotate zoom fullscreen',
		size: {
			// width: 500,
			height: 400
		}
	}
};
ReactSphereViewer.propTypes = {
	src: _react.PropTypes.string.isRequired,
	options: _react.PropTypes.object
};
exports['default'] = ReactSphereViewer;
module.exports = exports['default'];

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"photo-sphere-viewer-sa":1,"uevent":2}]},{},[3])(3)
});