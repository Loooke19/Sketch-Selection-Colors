var sketch = require('sketch');
var UI = require('sketch/ui');
var Document = require('sketch/dom').Document;
var Style = require('sketch/dom').Style;

// 存储数据
var collectedColors = { solids: {}, gradients: {} };
var allLayers = {};
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
    if (!stops || stops.length === 0) {
        return createColorImage('#CCCCCC', 1, width, height);
    }

    var image = NSImage.alloc().initWithSize(NSMakeSize(width, height));
    image.lockFocus();

    var path = NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius(
        NSMakeRect(0, 0, width, height), 4, 4
    );
    path.addClip();

    // 绘制渐变 - 手动绘制每个色带
    var numSteps = 20;
    for (var i = 0; i < numSteps; i++) {
        var t = i / (numSteps - 1);
        var x = t * width;
        var stepWidth = width / numSteps + 1;

        // 找到对应位置的颜色
        var color = getColorAtPosition(stops, t);
        color.setFill();
        NSBezierPath.fillRect(NSMakeRect(x, 0, stepWidth, height));
    }

    // 添加边框
    NSColor.colorWithWhite_alpha(0, 0.1).setStroke();
    NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius(
        NSMakeRect(0, 0, width, height), 4, 4
    ).stroke();

    image.unlockFocus();
    return image;
}

// 根据位置获取渐变颜色
function getColorAtPosition(stops, position) {
    if (stops.length === 1) {
        return hexToNSColor(stops[0].color, 1);
    }

    // 找到位置两侧的色标
    var leftStop = stops[0];
    var rightStop = stops[stops.length - 1];

    for (var i = 0; i < stops.length - 1; i++) {
        if (position >= stops[i].position && position <= stops[i + 1].position) {
            leftStop = stops[i];
            rightStop = stops[i + 1];
            break;
        }
    }

    // 计算插值
    var range = rightStop.position - leftStop.position;
    var t = range > 0 ? (position - leftStop.position) / range : 0;

    var leftColor = hexToNSColor(leftStop.color, 1);
    var rightColor = hexToNSColor(rightStop.color, 1);

    return leftColor.blendedColorWithFraction_ofColor(t, rightColor);
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

    var panelWidth = 300;
    var itemHeight = 40;
    var headerHeight = 24;
    var padding = 8;
    var sidePadding = 12;

    // 计算内容高度
    var contentTotalHeight = padding;
    if (solidsArray.length > 0) contentTotalHeight += headerHeight + solidsArray.length * itemHeight;
    if (gradientsArray.length > 0) contentTotalHeight += headerHeight + gradientsArray.length * itemHeight;
    contentTotalHeight += padding;

    var scrollHeight = Math.min(380, contentTotalHeight);

    // 创建下拉选项
    var options = [];
    var optionData = [];

    for (var i = 0; i < solidsArray.length; i++) {
        var solid = solidsArray[i].data;
        var display = '● ' + solid.color;
        if (solid.opacity < 1) display += ' (' + Math.round(solid.opacity * 100) + '%)';
        display += '  →  ' + solid.layerIds.length + ' layers';
        options.push(display);
        optionData.push({ type: 'solid', index: i });
    }

    for (var i = 0; i < gradientsArray.length; i++) {
        var gradient = gradientsArray[i].data;
        options.push('◐ ' + gradient.type + '  →  ' + gradient.layerIds.length + ' layers');
        optionData.push({ type: 'gradient', index: i });
    }

    // 创建下拉菜单
    var popup = NSPopUpButton.alloc().initWithFrame(NSMakeRect(0, 0, panelWidth, 26));
    for (var i = 0; i < options.length; i++) {
        popup.addItemWithTitle(options[i]);
    }

    // 创建圆角白色背景容器
    var containerView = NSView.alloc().initWithFrame(NSMakeRect(0, 0, panelWidth, scrollHeight));
    containerView.setWantsLayer(true);
    containerView.layer().setCornerRadius(10);
    containerView.layer().setMasksToBounds(true);
    containerView.layer().setBackgroundColor(NSColor.whiteColor().CGColor());
    containerView.layer().setBorderColor(NSColor.colorWithWhite_alpha(0.85, 1).CGColor());
    containerView.layer().setBorderWidth(1);

    // 创建滚动视图
    var scrollView = NSScrollView.alloc().initWithFrame(NSMakeRect(0, 0, panelWidth, scrollHeight));
    scrollView.setHasVerticalScroller(true);
    scrollView.setAutohidesScrollers(true);
    scrollView.setDrawsBackground(false);

    // 创建内容视图
    var contentView = NSView.alloc().initWithFrame(NSMakeRect(0, 0, panelWidth, contentTotalHeight));
    var currentY = contentTotalHeight - padding;

    var itemIndex = 0;
    var buttonPositions = [];

    // 纯色部分
    if (solidsArray.length > 0) {
        currentY -= headerHeight;
        var title = NSTextField.alloc().initWithFrame(NSMakeRect(sidePadding, currentY, panelWidth - sidePadding * 2, headerHeight));
        title.setStringValue('SOLID COLORS (' + solidsArray.length + ')');
        title.setBezeled(false);
        title.setDrawsBackground(false);
        title.setEditable(false);
        title.setFont(NSFont.boldSystemFontOfSize(10));
        title.setTextColor(NSColor.secondaryLabelColor());
        contentView.addSubview(title);

        for (var i = 0; i < solidsArray.length; i++) {
            currentY -= itemHeight;
            var solid = solidsArray[i].data;

            buttonPositions.push({ y: currentY, index: itemIndex });

            // 颜色方块 - 居中对齐
            var colorBox = NSImageView.alloc().initWithFrame(NSMakeRect(sidePadding, currentY + 8, 24, 24));
            colorBox.setImage(createColorImage(solid.color, solid.opacity, 24, 24));
            contentView.addSubview(colorBox);

            // 色值 - 紧跟颜色方块
            var label = NSTextField.alloc().initWithFrame(NSMakeRect(sidePadding + 32, currentY + 12, 150, 16));
            label.setStringValue(solid.color + (solid.opacity < 1 ? ' (' + Math.round(solid.opacity * 100) + '%)' : ''));
            label.setBezeled(false);
            label.setDrawsBackground(false);
            label.setEditable(false);
            label.setFont(NSFont.monospacedSystemFontOfSize_weight(12, NSFontWeightMedium));
            contentView.addSubview(label);

            // 图层数 - 靠右对齐
            var countLabel = NSTextField.alloc().initWithFrame(NSMakeRect(panelWidth - sidePadding - 60, currentY + 12, 55, 16));
            countLabel.setStringValue(solid.layerIds.length + ' layers');
            countLabel.setBezeled(false);
            countLabel.setDrawsBackground(false);
            countLabel.setEditable(false);
            countLabel.setFont(NSFont.systemFontOfSize(10));
            countLabel.setTextColor(NSColor.secondaryLabelColor());
            countLabel.setAlignment(NSTextAlignmentRight);
            contentView.addSubview(countLabel);

            itemIndex++;
        }
    }

    // 渐变部分
    if (gradientsArray.length > 0) {
        currentY -= headerHeight;
        var title = NSTextField.alloc().initWithFrame(NSMakeRect(sidePadding, currentY, panelWidth - sidePadding * 2, headerHeight));
        title.setStringValue('GRADIENTS (' + gradientsArray.length + ')');
        title.setBezeled(false);
        title.setDrawsBackground(false);
        title.setEditable(false);
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
            label.setBezeled(false);
            label.setDrawsBackground(false);
            label.setEditable(false);
            label.setFont(NSFont.systemFontOfSize(12));
            label.setTextColor(NSColor.labelColor());
            contentView.addSubview(label);

            var countLabel = NSTextField.alloc().initWithFrame(NSMakeRect(panelWidth - sidePadding - 60, currentY + 12, 55, 16));
            countLabel.setStringValue(gradient.layerIds.length + ' layers');
            countLabel.setBezeled(false);
            countLabel.setDrawsBackground(false);
            countLabel.setEditable(false);
            countLabel.setFont(NSFont.systemFontOfSize(10));
            countLabel.setTextColor(NSColor.secondaryLabelColor());
            countLabel.setAlignment(NSTextAlignmentRight);
            contentView.addSubview(countLabel);

            itemIndex++;
        }
    }

    // 最后添加按钮
    for (var i = 0; i < buttonPositions.length; i++) {
        var pos = buttonPositions[i];
        var rowBtn = NSButton.alloc().initWithFrame(NSMakeRect(0, pos.y, panelWidth, itemHeight));
        rowBtn.setBezelStyle(NSBezelStyleInline);
        rowBtn.setBordered(false);
        rowBtn.setTitle('');
        rowBtn.setTag(pos.index);
        rowBtn.setButtonType(NSButtonTypeMomentaryLight);
        rowBtn.setTransparent(true);

        rowBtn.setCOSJSTargetFunction(function (sender) {
            popup.selectItemAtIndex(sender.tag());
        });
        contentView.addSubview(rowBtn);
    }

    scrollView.setDocumentView(contentView);
    containerView.addSubview(scrollView);

    // 使用 NSPanel 完全控制布局 - 四边间距20px
    var margin = 20;
    var buttonHeight = 32;
    var gapBetween = 8;
    var dialogWidth = panelWidth + margin * 2;
    var dialogHeight = margin + scrollHeight + gapBetween + 26 + gapBetween + buttonHeight + margin;

    // 创建主窗口
    var panel = NSPanel.alloc().initWithContentRect_styleMask_backing_defer(
        NSMakeRect(0, 0, dialogWidth, dialogHeight),
        NSWindowStyleMaskTitled | NSWindowStyleMaskClosable,
        NSBackingStoreBuffered,
        false
    );
    panel.setTitle('Selection Colors');

    // 主容器
    var mainView = NSView.alloc().initWithFrame(NSMakeRect(0, 0, dialogWidth, dialogHeight));
    mainView.setWantsLayer(true);

    // 白色背景容器 - 顶部
    containerView.setFrame(NSMakeRect(margin, dialogHeight - margin - scrollHeight, panelWidth, scrollHeight));
    mainView.addSubview(containerView);

    // 下拉菜单
    popup.setFrame(NSMakeRect(margin, dialogHeight - margin - scrollHeight - gapBetween - 26, panelWidth, 26));
    mainView.addSubview(popup);

    // 按钮区域
    var buttonY = margin;
    var buttonWidth = 100;
    var buttonGap = 10;

    // Cancel 按钮
    var cancelBtn = NSButton.alloc().initWithFrame(NSMakeRect(dialogWidth - margin - buttonWidth * 2 - buttonGap, buttonY, buttonWidth, buttonHeight));
    cancelBtn.setTitle('Cancel');
    cancelBtn.setBezelStyle(NSBezelStyleRounded);
    cancelBtn.setCOSJSTargetFunction(function (sender) {
        panel.close();
        NSApp.stopModalWithCode(0);
    });
    mainView.addSubview(cancelBtn);

    // Select Layers 按钮
    var selectBtn = NSButton.alloc().initWithFrame(NSMakeRect(dialogWidth - margin - buttonWidth, buttonY, buttonWidth, buttonHeight));
    selectBtn.setTitle('Select Layers');
    selectBtn.setBezelStyle(NSBezelStyleRounded);
    selectBtn.setKeyEquivalent('\r');
    selectBtn.setCOSJSTargetFunction(function (sender) {
        panel.close();
        NSApp.stopModalWithCode(1);
    });
    mainView.addSubview(selectBtn);

    panel.setContentView(mainView);
    panel.center();

    // 运行模态
    var response = NSApp.runModalForWindow(panel);

    if (response === 1) {
        var selectedIndex = popup.indexOfSelectedItem();
        if (selectedIndex >= 0 && selectedIndex < optionData.length) {
            var sel = optionData[selectedIndex];
            selectLayersByIndex(sel.type, sel.index);
        }
    }
}

module.exports = {
    showSelectionColors: showSelectionColors
};
