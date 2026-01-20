var sketch = require('sketch');
var UI = require('sketch/ui');
var Document = require('sketch/dom').Document;
var Style = require('sketch/dom').Style;

// 存储数据
var collectedColors = { solids: {}, gradients: {} };
var allLayers = {};
var currentPanel = null;
var solidsArray = [];
var gradientsArray = [];

// 颜色转换
function colorToHex(color) {
  if (!color) return null;
  if (typeof color === 'string' && color.startsWith('#')) {
    if (color.length === 9) return color.substring(0, 7).toUpperCase();
    if (color.length === 7) return color.toUpperCase();
    return color.toUpperCase();
  }
  return String(color).toUpperCase();
}

function getOpacity(color) {
  if (!color) return 1;
  if (typeof color === 'string' && color.startsWith('#') && color.length === 9) {
    return Math.round((parseInt(color.substring(7, 9), 16) / 255) * 100) / 100;
  }
  return 1;
}

function hexToNSColor(hex, opacity) {
  if (!hex || hex.length < 7) return NSColor.grayColor();
  var r = parseInt(hex.substr(1, 2), 16) / 255;
  var g = parseInt(hex.substr(3, 2), 16) / 255;
  var b = parseInt(hex.substr(5, 2), 16) / 255;
  return NSColor.colorWithRed_green_blue_alpha(r, g, b, opacity || 1);
}

// 收集颜色
function collectFillColors(fills, layerId) {
  if (!fills) return;
  for (var i = 0; i < fills.length; i++) {
    var fill = fills[i];
    if (!fill.enabled) continue;
    var fillType = String(fill.fillType);
    if (fillType === 'Color' || fillType === '0') {
      var hex = colorToHex(fill.color);
      if (hex) addSolidColor(hex, getOpacity(fill.color), layerId);
    } else if (fillType === 'Gradient' || fillType === '1') {
      if (fill.gradient) addGradient(fill.gradient, layerId);
    }
  }
}

function collectBorderColors(borders, layerId) {
  if (!borders) return;
  for (var i = 0; i < borders.length; i++) {
    var border = borders[i];
    if (!border.enabled) continue;
    var fillType = String(border.fillType);
    if (fillType === 'Color' || fillType === '0') {
      var hex = colorToHex(border.color);
      if (hex) addSolidColor(hex, getOpacity(border.color), layerId);
    } else if (fillType === 'Gradient' || fillType === '1') {
      if (border.gradient) addGradient(border.gradient, layerId);
    }
  }
}

function addSolidColor(hex, opacity, layerId) {
  var key = hex + '_' + opacity.toFixed(2);
  if (!collectedColors.solids[key]) {
    collectedColors.solids[key] = { color: hex, opacity: opacity, layerIds: [] };
  }
  if (collectedColors.solids[key].layerIds.indexOf(layerId) === -1) {
    collectedColors.solids[key].layerIds.push(layerId);
  }
}

function addGradient(gradient, layerId) {
  if (!gradient || !gradient.stops) return;
  var type = 'Linear';
  var gType = String(gradient.gradientType);
  if (gType === 'Radial' || gType === '1') type = 'Radial';
  else if (gType === 'Angular' || gType === '2') type = 'Angular';

  var stops = gradient.stops.map(function (s) {
    return { color: colorToHex(s.color), position: s.position };
  });
  var key = type + '_' + JSON.stringify(stops);

  if (!collectedColors.gradients[key]) {
    collectedColors.gradients[key] = { type: type, stops: stops, layerIds: [] };
  }
  if (collectedColors.gradients[key].layerIds.indexOf(layerId) === -1) {
    collectedColors.gradients[key].layerIds.push(layerId);
  }
}

function collectColorsFromLayer(layer) {
  allLayers[layer.id] = layer;
  if (layer.style) {
    collectFillColors(layer.style.fills, layer.id);
    collectBorderColors(layer.style.borders, layer.id);
    if (layer.type === 'Text' && layer.style.textColor) {
      var hex = colorToHex(layer.style.textColor);
      if (hex) addSolidColor(hex, getOpacity(layer.style.textColor), layer.id);
    }
  }
  if (layer.layers) {
    for (var i = 0; i < layer.layers.length; i++) {
      collectColorsFromLayer(layer.layers[i]);
    }
  }
}

// 创建渐变图片
function createGradientImage(stops, width, height) {
  var colors = [];
  var locations = [];

  for (var i = 0; i < stops.length; i++) {
    colors.push(hexToNSColor(stops[i].color, 1));
    locations.push(stops[i].position);
  }

  var gradient = NSGradient.alloc().initWithColors_atLocations_colorSpace(
    colors,
    locations,
    NSColorSpace.sRGBColorSpace()
  );

  var image = NSImage.alloc().initWithSize(NSMakeSize(width, height));
  image.lockFocus();

  var path = NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius(
    NSMakeRect(0, 0, width, height), 4, 4
  );
  gradient.drawInBezierPath_angle(path, 0);

  image.unlockFocus();
  return image;
}

// 创建颜色方块图片
function createColorImage(hex, opacity, width, height) {
  var image = NSImage.alloc().initWithSize(NSMakeSize(width, height));
  image.lockFocus();
  var path = NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius(NSMakeRect(0, 0, width, height), 4, 4);
  hexToNSColor(hex, opacity).setFill();
  path.fill();
  NSColor.colorWithWhite_alpha(0, 0.1).setStroke();
  path.stroke();
  image.unlockFocus();
  return image;
}

// 选择图层
function selectLayersByIndex(type, index) {
  var document = Document.getSelectedDocument();
  if (!document) return;

  var layerIds;

  if (type === 'gradient') {
    if (index >= 0 && index < gradientsArray.length) {
      layerIds = gradientsArray[index].data.layerIds;
    }
  } else {
    if (index >= 0 && index < solidsArray.length) {
      layerIds = solidsArray[index].data.layerIds;
    }
  }

  if (!layerIds || layerIds.length === 0) {
    UI.message('No layers found');
    return;
  }

  document.selectedLayers.clear();
  var count = 0;
  for (var i = 0; i < layerIds.length; i++) {
    var layer = allLayers[layerIds[i]];
    if (layer) { layer.selected = true; count++; }
  }
  UI.message('Selected ' + count + ' layer' + (count > 1 ? 's' : ''));
}

// 显示选择对话框
function showSelectDialog() {
  // 关闭面板
  if (currentPanel) {
    currentPanel.close();
    currentPanel = null;
  }

  // 构建选项
  var options = [];
  var optionData = [];

  for (var i = 0; i < solidsArray.length; i++) {
    var solid = solidsArray[i].data;
    var display = '● ' + solid.color;
    if (solid.opacity < 1) display += ' (' + Math.round(solid.opacity * 100) + '%)';
    display += ' → ' + solid.layerIds.length + ' layers';
    options.push(display);
    optionData.push({ type: 'solid', index: i });
  }

  for (var i = 0; i < gradientsArray.length; i++) {
    var gradient = gradientsArray[i].data;
    var display = '◐ ' + gradient.type + ' Gradient → ' + gradient.layerIds.length + ' layers';
    options.push(display);
    optionData.push({ type: 'gradient', index: i });
  }

  UI.getInputFromUser(
    'Select a color to highlight layers:',
    {
      type: UI.INPUT_TYPE.selection,
      possibleValues: options
    },
    function (err, value) {
      if (err) return;
      var idx = options.indexOf(value);
      if (idx >= 0) {
        selectLayersByIndex(optionData[idx].type, optionData[idx].index);
      }
    }
  );
}

// 显示面板
function showColorPanel() {
  solidsArray = Object.keys(collectedColors.solids).map(function (k, i) {
    return { key: k, index: i, data: collectedColors.solids[k] };
  });
  gradientsArray = Object.keys(collectedColors.gradients).map(function (k, i) {
    return { key: k, index: i, data: collectedColors.gradients[k] };
  });

  var totalItems = solidsArray.length + gradientsArray.length;
  if (totalItems === 0) {
    UI.message('No colors found in selection');
    return;
  }

  if (currentPanel) {
    currentPanel.close();
    currentPanel = null;
  }

  var panelWidth = 280;
  var itemHeight = 40;
  var headerHeight = 28;
  var padding = 12;
  var sectionGap = 16;
  var buttonHeight = 36;

  var contentHeight = padding;
  if (solidsArray.length > 0) contentHeight += headerHeight + solidsArray.length * itemHeight + sectionGap;
  if (gradientsArray.length > 0) contentHeight += headerHeight + gradientsArray.length * itemHeight;
  contentHeight += padding + buttonHeight + padding;

  var panelHeight = Math.min(520, contentHeight + 28);
  var scrollContentHeight = contentHeight;

  // 创建面板
  var panel = NSPanel.alloc().initWithContentRect_styleMask_backing_defer(
    NSMakeRect(0, 0, panelWidth, panelHeight),
    NSWindowStyleMaskTitled | NSWindowStyleMaskClosable,
    NSBackingStoreBuffered,
    false
  );
  panel.setTitle('Selection Colors');
  panel.setLevel(NSFloatingWindowLevel);
  panel.setHidesOnDeactivate(false);
  panel.setReleasedWhenClosed(false);

  // 创建滚动视图
  var scrollViewHeight = panelHeight - 28 - buttonHeight - padding * 2;
  var scrollView = NSScrollView.alloc().initWithFrame(NSMakeRect(0, buttonHeight + padding * 2, panelWidth, scrollViewHeight));
  scrollView.setHasVerticalScroller(true);
  scrollView.setAutohidesScrollers(true);

  // 创建内容视图
  var docHeight = contentHeight - buttonHeight - padding;
  var contentView = NSView.alloc().initWithFrame(NSMakeRect(0, 0, panelWidth, docHeight));

  var currentY = docHeight - padding;

  // 纯色部分
  if (solidsArray.length > 0) {
    currentY -= 18;
    var solidTitle = NSTextField.alloc().initWithFrame(NSMakeRect(padding, currentY, panelWidth - padding * 2, 18));
    solidTitle.setStringValue('SOLID COLORS (' + solidsArray.length + ')');
    solidTitle.setBezeled(false);
    solidTitle.setDrawsBackground(false);
    solidTitle.setEditable(false);
    solidTitle.setSelectable(false);
    solidTitle.setFont(NSFont.systemFontOfSize_weight(10, NSFontWeightMedium));
    solidTitle.setTextColor(NSColor.secondaryLabelColor());
    contentView.addSubview(solidTitle);
    currentY -= (headerHeight - 18);

    for (var i = 0; i < solidsArray.length; i++) {
      var solid = solidsArray[i].data;
      currentY -= itemHeight;

      var colorBox = NSImageView.alloc().initWithFrame(NSMakeRect(padding + 8, currentY + 8, 24, 24));
      colorBox.setImage(createColorImage(solid.color, solid.opacity, 24, 24));
      contentView.addSubview(colorBox);

      var displayValue = solid.color + (solid.opacity < 1 ? ' (' + Math.round(solid.opacity * 100) + '%)' : '');
      var colorLabel = NSTextField.alloc().initWithFrame(NSMakeRect(padding + 42, currentY + 12, 140, 16));
      colorLabel.setStringValue(displayValue);
      colorLabel.setBezeled(false);
      colorLabel.setDrawsBackground(false);
      colorLabel.setEditable(false);
      colorLabel.setSelectable(false);
      colorLabel.setFont(NSFont.monospacedSystemFontOfSize_weight(11, NSFontWeightRegular));
      contentView.addSubview(colorLabel);

      var countLabel = NSTextField.alloc().initWithFrame(NSMakeRect(panelWidth - padding - 60, currentY + 12, 50, 16));
      countLabel.setStringValue(solid.layerIds.length + ' layers');
      countLabel.setBezeled(false);
      countLabel.setDrawsBackground(false);
      countLabel.setEditable(false);
      countLabel.setSelectable(false);
      countLabel.setFont(NSFont.systemFontOfSize(10));
      countLabel.setTextColor(NSColor.secondaryLabelColor());
      countLabel.setAlignment(NSTextAlignmentRight);
      contentView.addSubview(countLabel);
    }
    currentY -= sectionGap;
  }

  // 渐变部分
  if (gradientsArray.length > 0) {
    currentY -= 18;
    var gradTitle = NSTextField.alloc().initWithFrame(NSMakeRect(padding, currentY, panelWidth - padding * 2, 18));
    gradTitle.setStringValue('GRADIENTS (' + gradientsArray.length + ')');
    gradTitle.setBezeled(false);
    gradTitle.setDrawsBackground(false);
    gradTitle.setEditable(false);
    gradTitle.setSelectable(false);
    gradTitle.setFont(NSFont.systemFontOfSize_weight(10, NSFontWeightMedium));
    gradTitle.setTextColor(NSColor.secondaryLabelColor());
    contentView.addSubview(gradTitle);
    currentY -= (headerHeight - 18);

    for (var i = 0; i < gradientsArray.length; i++) {
      var gradient = gradientsArray[i].data;
      currentY -= itemHeight;

      var gradBox = NSImageView.alloc().initWithFrame(NSMakeRect(padding + 8, currentY + 8, 24, 24));
      gradBox.setImage(createGradientImage(gradient.stops, 24, 24));
      contentView.addSubview(gradBox);

      var gradLabel = NSTextField.alloc().initWithFrame(NSMakeRect(padding + 42, currentY + 12, 100, 16));
      gradLabel.setStringValue(gradient.type);
      gradLabel.setBezeled(false);
      gradLabel.setDrawsBackground(false);
      gradLabel.setEditable(false);
      gradLabel.setSelectable(false);
      gradLabel.setFont(NSFont.systemFontOfSize(12));
      gradLabel.setTextColor(NSColor.secondaryLabelColor());
      contentView.addSubview(gradLabel);

      var countLabel = NSTextField.alloc().initWithFrame(NSMakeRect(panelWidth - padding - 60, currentY + 12, 50, 16));
      countLabel.setStringValue(gradient.layerIds.length + ' layers');
      countLabel.setBezeled(false);
      countLabel.setDrawsBackground(false);
      countLabel.setEditable(false);
      countLabel.setSelectable(false);
      countLabel.setFont(NSFont.systemFontOfSize(10));
      countLabel.setTextColor(NSColor.secondaryLabelColor());
      countLabel.setAlignment(NSTextAlignmentRight);
      contentView.addSubview(countLabel);
    }
  }

  scrollView.setDocumentView(contentView);
  panel.contentView().addSubview(scrollView);

  // 添加选择按钮
  var selectButton = NSButton.alloc().initWithFrame(NSMakeRect(padding, padding, panelWidth - padding * 2, buttonHeight));
  selectButton.setBezelStyle(NSBezelStyleRounded);
  selectButton.setTitle('🎯 Select Layers by Color...');
  selectButton.setFont(NSFont.systemFontOfSize(13));
  selectButton.setCOSJSTargetFunction(function (sender) {
    showSelectDialog();
  });
  panel.contentView().addSubview(selectButton);

  panel.center();
  panel.makeKeyAndOrderFront(null);

  currentPanel = panel;
}

// 主函数
function showSelectionColors(context) {
  collectedColors = { solids: {}, gradients: {} };
  allLayers = {};

  var document = Document.getSelectedDocument();
  if (!document) {
    UI.message('Please open a document first');
    return;
  }

  var selection = document.selectedLayers;
  if (!selection || selection.length === 0) {
    UI.message('Please select at least one layer');
    return;
  }

  selection.forEach(function (layer) {
    collectColorsFromLayer(layer);
  });

  showColorPanel();
}

module.exports = {
  showSelectionColors: showSelectionColors
};
