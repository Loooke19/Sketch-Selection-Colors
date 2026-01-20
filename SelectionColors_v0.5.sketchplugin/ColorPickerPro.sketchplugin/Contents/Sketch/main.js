var sketch = require('sketch');
var UI = require('sketch/ui');
var Document = require('sketch/dom').Document;

// 全局变量
var collectedColors = { solids: {}, gradients: {} };
var allLayers = {};
var solidsArray = [];
var gradientsArray = [];
var optionData = [];
var thePanel = null;
var thePopup = null;
var theMainView = null;
var theContainerView = null;
var lastSelectionIds = '';
var rowLabels = [];
var selectedRowIndex = -1;
var panelWidth = 300;
var margin = 20;
var buttonHeight = 32;
var gapBetween = 8;
var documentSwatches = {}; // hex_opacity -> swatch name
var swatchIdToName = {};   // swatchID -> swatch name

// 颜色转换函数
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

// 颜色收集函数
function collectFillColors(fills, layerId, nativeFills) {
    if (!fills) return;
    for (var i = 0; i < fills.length; i++) {
        var fill = fills[i];
        if (!fill.enabled) continue;
        var fillType = String(fill.fillType);
        if (fillType === 'Color' || fillType === '0') {
            var hex = colorToHex(fill.color);
            if (hex) {
                // 检测是否引用了 swatch
                var swatchName = null;
                var isSwatchRef = false;
                try {
                    if (nativeFills && nativeFills[i]) {
                        var nativeFill = nativeFills[i];
                        var nativeColor = nativeFill.color ? nativeFill.color() : null;
                        if (nativeColor && nativeColor.swatchID && nativeColor.swatchID()) {
                            var swatchId = String(nativeColor.swatchID());
                            if (swatchIdToName[swatchId]) {
                                swatchName = swatchIdToName[swatchId];
                                isSwatchRef = true;
                            }
                        }
                    }
                } catch (e) { }
                addSolidColor(hex, getOpacity(fill.color), layerId, swatchName, isSwatchRef);
            }
        } else if (fillType === 'Gradient' || fillType === '1') {
            if (fill.gradient) addGradient(fill.gradient, layerId);
        }
    }
}

function collectBorderColors(borders, layerId, nativeBorders) {
    if (!borders) return;
    for (var i = 0; i < borders.length; i++) {
        var border = borders[i];
        if (!border.enabled) continue;
        var fillType = String(border.fillType);
        if (fillType === 'Color' || fillType === '0') {
            var hex = colorToHex(border.color);
            if (hex) {
                // 检测是否引用了 swatch
                var swatchName = null;
                var isSwatchRef = false;
                try {
                    if (nativeBorders && nativeBorders[i]) {
                        var nativeBorder = nativeBorders[i];
                        var nativeColor = nativeBorder.color ? nativeBorder.color() : null;
                        if (nativeColor && nativeColor.swatchID && nativeColor.swatchID()) {
                            var swatchId = String(nativeColor.swatchID());
                            if (swatchIdToName[swatchId]) {
                                swatchName = swatchIdToName[swatchId];
                                isSwatchRef = true;
                            }
                        }
                    }
                } catch (e) { }
                addSolidColor(hex, getOpacity(border.color), layerId, swatchName, isSwatchRef);
            }
        } else if (fillType === 'Gradient' || fillType === '1') {
            if (border.gradient) addGradient(border.gradient, layerId);
        }
    }
}

function addSolidColor(hex, opacity, layerId, swatchName, isSwatchRef) {
    // 区分变量引用和直接色值
    var key = hex + '_' + opacity.toFixed(2) + '_' + (isSwatchRef ? 'swatch:' + swatchName : 'hex');
    if (!collectedColors.solids[key]) {
        collectedColors.solids[key] = {
            color: hex,
            opacity: opacity,
            layerIds: [],
            swatchName: swatchName,
            isSwatchRef: isSwatchRef
        };
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
        // 获取 native style 以检测 swatch 引用
        var nativeStyle = null;
        var nativeFills = null;
        var nativeBorders = null;
        try {
            if (layer.sketchObject && layer.sketchObject.style) {
                nativeStyle = layer.sketchObject.style();
                if (nativeStyle) {
                    nativeFills = nativeStyle.fills ? nativeStyle.fills() : null;
                    nativeBorders = nativeStyle.borders ? nativeStyle.borders() : null;
                }
            }
        } catch (e) { }

        collectFillColors(layer.style.fills, layer.id, nativeFills);
        collectBorderColors(layer.style.borders, layer.id, nativeBorders);

        if (layer.type === 'Text' && layer.style.textColor) {
            var hex = colorToHex(layer.style.textColor);
            if (hex) {
                // 检测文字颜色是否引用了 swatch
                var swatchName = null;
                var isSwatchRef = false;
                try {
                    if (nativeStyle && nativeStyle.textStyle) {
                        var textStyle = nativeStyle.textStyle();
                        if (textStyle && textStyle.attributes) {
                            var attrs = textStyle.attributes();
                            var foregroundColor = attrs.objectForKey ? attrs.objectForKey('NSColor') : null;
                            if (foregroundColor && foregroundColor.swatchID && foregroundColor.swatchID()) {
                                var swatchId = String(foregroundColor.swatchID());
                                if (swatchIdToName[swatchId]) {
                                    swatchName = swatchIdToName[swatchId];
                                    isSwatchRef = true;
                                }
                            }
                        }
                    }
                } catch (e) { }
                addSolidColor(hex, getOpacity(layer.style.textColor), layer.id, swatchName, isSwatchRef);
            }
        }
    }
    if (layer.layers) {
        for (var i = 0; i < layer.layers.length; i++) {
            collectColorsFromLayer(layer.layers[i]);
        }
    }
}

// 加载文档颜色变量
function loadDocumentSwatches() {
    documentSwatches = {};
    swatchIdToName = {};
    var document = Document.getSelectedDocument();
    if (!document) return;

    try {
        var swatches = document.swatches;
        if (swatches && swatches.length > 0) {
            for (var i = 0; i < swatches.length; i++) {
                var swatch = swatches[i];
                if (swatch && swatch.name && swatch.color) {
                    var hex = colorToHex(swatch.color);
                    var opacity = getOpacity(swatch.color);
                    var key = hex + '_' + opacity.toFixed(2);
                    documentSwatches[key] = swatch.name;

                    // 通过 native 获取 swatch ID
                    if (swatch.sketchObject && swatch.sketchObject.objectID) {
                        swatchIdToName[String(swatch.sketchObject.objectID())] = swatch.name;
                    }
                }
            }
        }
    } catch (e) { }
}

function collectCurrentSelectionColors() {
    collectedColors = { solids: {}, gradients: {} };
    allLayers = {};
    var document = Document.getSelectedDocument();
    if (!document) return false;

    // 先加载文档颜色变量
    loadDocumentSwatches();

    var selection = document.selectedLayers;
    if (!selection || selection.length === 0) return false;
    selection.forEach(function (layer) { collectColorsFromLayer(layer); });
    solidsArray = Object.keys(collectedColors.solids).map(function (k, i) {
        return { key: k, index: i, data: collectedColors.solids[k] };
    });
    // 排序：颜色变量在前，hex色值在后，各自按图层数量降序排序
    solidsArray.sort(function (a, b) {
        // 先按 swatch 引用分组（变量在前）
        if (a.data.isSwatchRef && !b.data.isSwatchRef) return -1;
        if (!a.data.isSwatchRef && b.data.isSwatchRef) return 1;
        // 同组内按 layer 数量降序排序
        return b.data.layerIds.length - a.data.layerIds.length;
    });
    gradientsArray = Object.keys(collectedColors.gradients).map(function (k, i) {
        return { key: k, index: i, data: collectedColors.gradients[k] };
    });
    // 按 layer 数量降序排序
    gradientsArray.sort(function (a, b) {
        return b.data.layerIds.length - a.data.layerIds.length;
    });
    return (solidsArray.length + gradientsArray.length) > 0;
}

function getSelectionIdString() {
    var document = Document.getSelectedDocument();
    if (!document) return '';
    var selection = document.selectedLayers;
    if (!selection || selection.length === 0) return '';
    var ids = [];
    selection.forEach(function (layer) { ids.push(layer.id); });
    return ids.sort().join(',');
}

// 图形函数
function createGradientImage(stops, width, height) {
    if (!stops || stops.length === 0) return createColorImage('#CCCCCC', 1, width, height);
    var image = NSImage.alloc().initWithSize(NSMakeSize(width, height));
    image.lockFocus();
    var path = NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius(NSMakeRect(0, 0, width, height), 4, 4);
    path.addClip();
    var numSteps = 20;
    for (var i = 0; i < numSteps; i++) {
        var t = i / (numSteps - 1);
        var x = t * width;
        var stepWidth = width / numSteps + 1;
        var color = getColorAtPosition(stops, t);
        color.setFill();
        NSBezierPath.fillRect(NSMakeRect(x, 0, stepWidth, height));
    }
    NSColor.colorWithWhite_alpha(0, 0.1).setStroke();
    NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius(NSMakeRect(0, 0, width, height), 4, 4).stroke();
    image.unlockFocus();
    return image;
}

function getColorAtPosition(stops, position) {
    if (stops.length === 1) return hexToNSColor(stops[0].color, 1);
    var leftStop = stops[0], rightStop = stops[stops.length - 1];
    for (var i = 0; i < stops.length - 1; i++) {
        if (position >= stops[i].position && position <= stops[i + 1].position) {
            leftStop = stops[i]; rightStop = stops[i + 1]; break;
        }
    }
    var range = rightStop.position - leftStop.position;
    var t = range > 0 ? (position - leftStop.position) / range : 0;
    var leftColor = hexToNSColor(leftStop.color, 1);
    var rightColor = hexToNSColor(rightStop.color, 1);
    return leftColor.blendedColorWithFraction_ofColor(t, rightColor);
}

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
        if (index >= 0 && index < gradientsArray.length) layerIds = gradientsArray[index].data.layerIds;
    } else {
        if (index >= 0 && index < solidsArray.length) layerIds = solidsArray[index].data.layerIds;
    }
    if (!layerIds || layerIds.length === 0) { UI.message('No layers found'); return; }
    document.selectedLayers.clear();
    var count = 0;
    for (var i = 0; i < layerIds.length; i++) {
        var layer = allLayers[layerIds[i]];
        if (layer) { layer.selected = true; count++; }
    }
    UI.message('Selected ' + count + ' layer' + (count > 1 ? 's' : ''));
    lastSelectionIds = getSelectionIdString();
}

// 构建内容视图
function buildColorContentView() {
    var itemHeight = 40, headerHeight = 24, padding = 8, sidePadding = 12, sectionGap = 12;
    var contentTotalHeight = padding;
    if (solidsArray.length > 0) contentTotalHeight += headerHeight + solidsArray.length * itemHeight;
    if (solidsArray.length > 0 && gradientsArray.length > 0) contentTotalHeight += sectionGap;
    if (gradientsArray.length > 0) contentTotalHeight += headerHeight + gradientsArray.length * itemHeight;
    contentTotalHeight += padding;
    var scrollHeight = Math.min(380, contentTotalHeight);

    thePopup.removeAllItems();
    optionData = [];
    for (var i = 0; i < solidsArray.length; i++) {
        var solid = solidsArray[i].data;
        var display;
        if (solid.isSwatchRef && solid.swatchName) {
            display = '● ' + solid.swatchName;
        } else {
            display = '● ' + solid.color;
            if (solid.opacity < 1) display += ' (' + Math.round(solid.opacity * 100) + '%)';
        }
        display += '  →  ' + solid.layerIds.length + ' layers';
        thePopup.addItemWithTitle(display);
        optionData.push({ type: 'solid', index: i });
    }
    for (var i = 0; i < gradientsArray.length; i++) {
        var gradient = gradientsArray[i].data;
        thePopup.addItemWithTitle('◐ ' + gradient.type + '  →  ' + gradient.layerIds.length + ' layers');
        optionData.push({ type: 'gradient', index: i });
    }

    var inset = 8;
    var containerHeight = scrollHeight + inset * 2;
    var containerView = NSView.alloc().initWithFrame(NSMakeRect(0, 0, panelWidth, containerHeight));
    containerView.setWantsLayer(true);
    containerView.layer().setCornerRadius(10);
    containerView.layer().setMasksToBounds(true);
    containerView.layer().setBackgroundColor(NSColor.whiteColor().CGColor());
    containerView.layer().setBorderColor(NSColor.colorWithWhite_alpha(0.85, 1).CGColor());
    containerView.layer().setBorderWidth(1);

    var scrollView = NSScrollView.alloc().initWithFrame(NSMakeRect(0, inset, panelWidth, scrollHeight));
    scrollView.setHasVerticalScroller(true);
    scrollView.setAutohidesScrollers(true);
    scrollView.setDrawsBackground(false);

    var contentView = NSView.alloc().initWithFrame(NSMakeRect(0, 0, panelWidth, contentTotalHeight));
    var currentY = contentTotalHeight - padding;
    var itemIndex = 0;
    var buttonPositions = [];
    rowLabels = [];

    // 如果没有颜色，显示提示文字
    if (solidsArray.length === 0 && gradientsArray.length === 0) {
        var placeholderLabel = NSTextField.alloc().initWithFrame(NSMakeRect(0, (contentTotalHeight - 20) / 2, panelWidth, 20));
        placeholderLabel.setStringValue('Please select layers');
        placeholderLabel.setBezeled(false);
        placeholderLabel.setDrawsBackground(false);
        placeholderLabel.setEditable(false);
        placeholderLabel.setSelectable(false);
        placeholderLabel.setFont(NSFont.systemFontOfSize(13));
        placeholderLabel.setTextColor(NSColor.secondaryLabelColor());
        placeholderLabel.setAlignment(NSTextAlignmentCenter);
        contentView.addSubview(placeholderLabel);
    }

    if (solidsArray.length > 0) {
        currentY -= headerHeight;
        var title = NSTextField.alloc().initWithFrame(NSMakeRect(sidePadding, currentY, panelWidth - sidePadding * 2, headerHeight));
        title.setStringValue('SOLID COLORS (' + solidsArray.length + ')');
        title.setBezeled(false); title.setDrawsBackground(false); title.setEditable(false);
        title.setFont(NSFont.boldSystemFontOfSize(10));
        title.setTextColor(NSColor.secondaryLabelColor());
        contentView.addSubview(title);

        for (var i = 0; i < solidsArray.length; i++) {
            currentY -= itemHeight;
            var solid = solidsArray[i].data;
            buttonPositions.push({ y: currentY, index: itemIndex });
            var colorBox = NSImageView.alloc().initWithFrame(NSMakeRect(sidePadding, currentY + 8, 24, 24));
            colorBox.setImage(createColorImage(solid.color, solid.opacity, 24, 24));
            contentView.addSubview(colorBox);
            var label = NSTextField.alloc().initWithFrame(NSMakeRect(sidePadding + 32, currentY + 12, 150, 16));
            // 如果是 swatch 引用显示变量名，否则显示 hex 色值
            var displayText;
            if (solid.isSwatchRef && solid.swatchName) {
                displayText = solid.swatchName;
            } else {
                displayText = solid.color + (solid.opacity < 1 ? ' (' + Math.round(solid.opacity * 100) + '%)' : '');
            }
            label.setStringValue(displayText);
            label.setBezeled(false); label.setDrawsBackground(false); label.setEditable(false);
            label.setFont(solid.isSwatchRef ? NSFont.systemFontOfSize(12) : NSFont.monospacedSystemFontOfSize_weight(12, NSFontWeightMedium));
            label.setTextColor(NSColor.labelColor());
            contentView.addSubview(label);
            var countLabel = NSTextField.alloc().initWithFrame(NSMakeRect(panelWidth - sidePadding - 60, currentY + 12, 55, 16));
            countLabel.setStringValue(solid.layerIds.length + ' layers');
            countLabel.setBezeled(false); countLabel.setDrawsBackground(false); countLabel.setEditable(false);
            countLabel.setFont(NSFont.systemFontOfSize(10));
            countLabel.setTextColor(NSColor.secondaryLabelColor());
            countLabel.setAlignment(NSTextAlignmentRight);
            contentView.addSubview(countLabel);
            rowLabels.push({ mainLabel: label, countLabel: countLabel });
            itemIndex++;
        }
    }

    if (gradientsArray.length > 0) {
        if (solidsArray.length > 0) currentY -= sectionGap;
        currentY -= headerHeight;
        var title = NSTextField.alloc().initWithFrame(NSMakeRect(sidePadding, currentY, panelWidth - sidePadding * 2, headerHeight));
        title.setStringValue('GRADIENTS (' + gradientsArray.length + ')');
        title.setBezeled(false); title.setDrawsBackground(false); title.setEditable(false);
        title.setFont(NSFont.boldSystemFontOfSize(10));
        title.setTextColor(NSColor.secondaryLabelColor());
        contentView.addSubview(title);

        for (var i = 0; i < gradientsArray.length; i++) {
            currentY -= itemHeight;
            var gradient = gradientsArray[i].data;
            buttonPositions.push({ y: currentY, index: itemIndex });
            var gradBox = NSImageView.alloc().initWithFrame(NSMakeRect(sidePadding, currentY + 8, 24, 24));
            gradBox.setImage(createGradientImage(gradient.stops, 24, 24));
            contentView.addSubview(gradBox);
            var label = NSTextField.alloc().initWithFrame(NSMakeRect(sidePadding + 32, currentY + 12, 100, 16));
            label.setStringValue(gradient.type);
            label.setBezeled(false); label.setDrawsBackground(false); label.setEditable(false);
            label.setFont(NSFont.systemFontOfSize(12));
            label.setTextColor(NSColor.labelColor());
            contentView.addSubview(label);
            var countLabel = NSTextField.alloc().initWithFrame(NSMakeRect(panelWidth - sidePadding - 60, currentY + 12, 55, 16));
            countLabel.setStringValue(gradient.layerIds.length + ' layers');
            countLabel.setBezeled(false); countLabel.setDrawsBackground(false); countLabel.setEditable(false);
            countLabel.setFont(NSFont.systemFontOfSize(10));
            countLabel.setTextColor(NSColor.secondaryLabelColor());
            countLabel.setAlignment(NSTextAlignmentRight);
            contentView.addSubview(countLabel);
            rowLabels.push({ mainLabel: label, countLabel: countLabel });
            itemIndex++;
        }
    }

    for (var i = 0; i < buttonPositions.length; i++) {
        var pos = buttonPositions[i];
        var rowBtn = NSButton.alloc().initWithFrame(NSMakeRect(0, pos.y, panelWidth, itemHeight));
        rowBtn.setBezelStyle(NSBezelStyleInline);
        rowBtn.setBordered(false); rowBtn.setTitle(''); rowBtn.setTag(pos.index);
        rowBtn.setButtonType(NSButtonTypeMomentaryLight);
        rowBtn.setTransparent(true);
        rowBtn.setCOSJSTargetFunction(function (sender) {
            var clickedIndex = sender.tag();
            thePopup.selectItemAtIndex(clickedIndex);
            // 重置所有行为默认颜色
            for (var j = 0; j < rowLabels.length; j++) {
                rowLabels[j].mainLabel.setTextColor(NSColor.labelColor());
                rowLabels[j].countLabel.setTextColor(NSColor.secondaryLabelColor());
            }
            // 高亮选中行为蓝色
            if (clickedIndex >= 0 && clickedIndex < rowLabels.length) {
                rowLabels[clickedIndex].mainLabel.setTextColor(NSColor.systemBlueColor());
                rowLabels[clickedIndex].countLabel.setTextColor(NSColor.systemBlueColor());
                selectedRowIndex = clickedIndex;
            }
        });
        contentView.addSubview(rowBtn);
    }

    scrollView.setDocumentView(contentView);
    // 滚动到顶部
    var maxScrollY = contentView.frame().size.height - scrollView.contentSize().height;
    if (maxScrollY > 0) {
        contentView.scrollPoint(NSMakePoint(0, maxScrollY));
    }
    containerView.addSubview(scrollView);
    return { containerView: containerView, scrollHeight: containerHeight };
}

// 刷新面板
function refreshPanelIfNeeded() {
    if (!thePanel || !thePanel.isVisible()) return;
    var newIds = getSelectionIdString();
    if (newIds === lastSelectionIds) return;
    lastSelectionIds = newIds;

    // 收集颜色，如果没有选中则清空数组
    var hasColors = collectCurrentSelectionColors();
    if (!hasColors) {
        solidsArray = [];
        gradientsArray = [];
    }

    if (theContainerView) theContainerView.removeFromSuperview();
    var result = buildColorContentView();
    theContainerView = result.containerView;
    var scrollHeight = result.scrollHeight;

    var dialogWidth = panelWidth + margin * 2;
    var dialogHeight = margin + scrollHeight + gapBetween + buttonHeight + margin;

    // 使用 setContentSize 而不是 setFrame，避免标题栏计算问题
    thePanel.setContentSize(NSMakeSize(dialogWidth, dialogHeight));
    theMainView.setFrameSize(NSMakeSize(dialogWidth, dialogHeight));

    theContainerView.setFrame(NSMakeRect(margin, dialogHeight - margin - scrollHeight, panelWidth, scrollHeight));
    theMainView.addSubview_positioned_relativeTo(theContainerView, NSWindowBelow, thePopup);
}

// 主函数
function showSelectionColors(context) {
    if (thePanel && thePanel.isVisible()) {
        thePanel.close();
        thePanel = null;
        return;
    }

    // 尝试收集颜色，如果没有选中图层则显示空列表
    collectCurrentSelectionColors();
    lastSelectionIds = getSelectionIdString();

    thePopup = NSPopUpButton.alloc().initWithFrame(NSMakeRect(0, 0, panelWidth, 26));
    var result = buildColorContentView();
    theContainerView = result.containerView;
    var scrollHeight = result.scrollHeight;

    var dialogWidth = panelWidth + margin * 2;
    var dialogHeight = margin + scrollHeight + gapBetween + buttonHeight + margin;

    thePanel = NSPanel.alloc().initWithContentRect_styleMask_backing_defer(
        NSMakeRect(0, 0, dialogWidth, dialogHeight),
        NSWindowStyleMaskTitled | NSWindowStyleMaskClosable,
        NSBackingStoreBuffered, false
    );
    thePanel.setTitle('Selection Colors');
    thePanel.setFloatingPanel(true);
    thePanel.setLevel(NSFloatingWindowLevel);

    theMainView = NSView.alloc().initWithFrame(NSMakeRect(0, 0, dialogWidth, dialogHeight));
    theMainView.setWantsLayer(true);

    theContainerView.setFrame(NSMakeRect(margin, dialogHeight - margin - scrollHeight, panelWidth, scrollHeight));
    theMainView.addSubview(theContainerView);

    // 隐藏下拉框但保留其功能
    thePopup.setFrame(NSMakeRect(-1000, -1000, panelWidth, 26));
    thePopup.setHidden(true);
    theMainView.addSubview(thePopup);

    var buttonY = margin;
    var buttonWidth = 100;
    var buttonGap = 10;

    var closeBtn = NSButton.alloc().initWithFrame(NSMakeRect(dialogWidth - margin - buttonWidth * 2 - buttonGap, buttonY, buttonWidth, buttonHeight));
    closeBtn.setTitle('Close');
    closeBtn.setBezelStyle(NSBezelStyleRounded);
    closeBtn.setKeyEquivalent(String.fromCharCode(27));
    closeBtn.setCOSJSTargetFunction(function (sender) { thePanel.close(); thePanel = null; });
    theMainView.addSubview(closeBtn);

    var selectBtn = NSButton.alloc().initWithFrame(NSMakeRect(dialogWidth - margin - buttonWidth, buttonY, buttonWidth, buttonHeight));
    selectBtn.setTitle('Select Layers');
    selectBtn.setBezelStyle(NSBezelStyleRounded);
    selectBtn.setKeyEquivalent('\r');
    selectBtn.setCOSJSTargetFunction(function (sender) {
        var idx = thePopup.indexOfSelectedItem();
        if (idx >= 0 && idx < optionData.length) selectLayersByIndex(optionData[idx].type, optionData[idx].index);
    });
    theMainView.addSubview(selectBtn);

    thePanel.setContentView(theMainView);
    thePanel.center();
    thePanel.setReleasedWhenClosed(false);

    // 非模态显示
    thePanel.orderFront(null);

    // 使用 coscript 定时器 - 递归调度
    coscript.shouldKeepAround = true;

    function scheduleRefresh() {
        coscript.scheduleWithInterval_jsFunction(0.5, function () {
            if (!thePanel || !thePanel.isVisible()) {
                coscript.shouldKeepAround = false;
                return;
            }
            refreshPanelIfNeeded();
            scheduleRefresh();
        });
    }
    scheduleRefresh();
}

module.exports = { showSelectionColors: showSelectionColors };
