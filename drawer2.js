/**
 *
 * @param  context
 * @return {number}
 */
function getPixelRatio(context) {
    const backingStore =
        context['backingStorePixelRatio'] ||
        context['webkitBackingStorePixelRatio'] ||
        context['mozBackingStorePixelRatio'] ||
        context['msBackingStorePixelRatio'] ||
        context['oBackingStorePixelRatio'] ||
        context['backingStorePixelRatio'];
    return (window.devicePixelRatio || 1) / (backingStore || 1);
}

/**
 * 在高分辨率上确保清晰度
 * @param canvas
 * @param ratio
 */
function ensureCleared(canvas, ratio) {
    canvas.style.width = canvas.width;
    canvas.style.height = canvas.height;
    canvas.width *= ratio;
    canvas.height *= ratio;
}

/**
 * 注册鼠标事件
 * @param canvas
 * @param eventHandle
 */
function registerMouseEvent(canvas, eventHandle) {
    const rect = canvas.getBoundingClientRect();
    [
        'onmousedown',
        'onmousemove',
        'onmouseup',
    ].forEach(eventName => {
        canvas[eventName] = (event) => {
            const x = event.pageX - rect.left;
            const y = event.pageY - rect.top;
            eventHandle({x: x, y: y, type: event.type});
        };
    });
}

/**
 * 画线
 * @param context
 * @param x1 起点x
 * @param y1 起点y
 * @param x2 终点x
 * @param y2 终点y
 */
function drawLine(context, x1, y1, x2, y2) {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
}

/**
 * 画板
 * @author ron
 * 2020.02.03
 */
class Drawer {

    /**
     * 构造器
     * @param canvas
     */
    constructor(canvas) {
        this.context = canvas.getContext("2d");
        this.container = new Container(0, 0, canvas.width, canvas.height);

        const ratio = getPixelRatio(this.context);
        ensureCleared(canvas, ratio);
        // 如果不设置，整个页面会变小
        this.context.scale(ratio, ratio);


        this.registerViews = new Map();

        registerMouseEvent(canvas, this.handleEvent.bind(this));
    }

    /**
     * 以60fps运行
     */
    run() {
        // 清除画布
        this.context.clearRect(this.container.x, this.container.y,
            this.container.width, this.container.height);

        this.container.draw(this.context);

        this.requestId = window.requestAnimationFrame(this.run.bind(this));
    }

    /**
     * 递归处理事件
     * @param event 事件
     */
    handleEvent(event) {
        this.registerViews.forEach((eventHandle, view) => {
            if (view.isIntersect(event.x, event.y)) {
                eventHandle(event);
            }
        });
    }

    /**
     * 注册鼠标事件
     * @param {View} view 视图
     * @param eventHandle
     */
    registerMouseEvent(view, eventHandle) {
        this.registerViews.set(view, eventHandle);
    }

    /**
     * 停止运行
     */
    stop() {
        window.cancelAnimationFrame(this.requestId);
    }
}

/**
 * 视图，显示图像的基类
 */
class View {

    /**
     * 构造器
     * @param x
     * @param y
     * @param width
     * @param height
     */
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;


        this.bg = null;

        this.border = {
            width: 0,
            color: '#000'
        };

        this.parent = null;
    }

    /**
     * 动态测量宽高
     * @param context
     */
    measure(context) {

    }

    /**
     * 当前view是否和某点相交
     * @param x
     * @param y
     * @return {Boolean}
     */
    isIntersect(x, y) {
        return x >= this.x && y >= this.y &&
            x <= (this.x + this.width) && y <= (this.y + this.height);
    }

    /**
     * 画图形
     * @param context
     */
    draw(context) {
        this._drawBg(context);
        this._drawBorder(context);
    }

    /**
     * 画背景
     * @param context
     * @private
     */
    _drawBg(context) {
        switch (typeof this.bg) {
            case "function":
                this.bg(context, this);
                break;
            case "string":
                context.fillStyle = this.bg;
                context.fillRect(this.x, this.y, this.width, this.height);
                break;
            default:
                break;
        }
    }

    /**
     * 画边框
     * @param context
     * @private
     */
    _drawBorder(context) {
        if (this.border && this.border.width > 0) {
            context.strokeStyle = this.border.color;
            context.lineWidth = this.border.width;
            context.strokeRect(this.x, this.y, this.width, this.height);
        }
    }
}

/**
 * 容器视图，可以添加子视图
 */
class Container extends View {

    /**
     * 构造器
     * @param x
     * @param y
     * @param width
     * @param height
     */
    constructor(x, y, width, height) {
        super(x, y, width, height);

        /**
         *
         * @type {View[]}
         */
        this.views = [];
        /**
         *
         * @type {LayoutManager}
         */
        this.layoutManager = null;

        /**
         *
         * @type {Map<View, {}>}
         */
        this.relativePoints = new Map();

        this.paddingLeft = 0;
        this.paddingTop = 0;
        this.paddingRight = 0;
        this.paddingBottom = 0;

    }

    draw(context) {
        super.draw(context);

        if (this.layoutManager) {
            this.layoutManager.layout(this, context);
        }

        this.views.forEach(view => {
            let point = this.relativePoints.get(view);
            if (!point) {
                point = {
                    x: view.x,
                    y: view.y
                };
                this.relativePoints.set(view, point);
            }

            view.x = this.paddingLeft + this.x + point.x;
            view.y = this.paddingTop + this.y + point.y;

            context.save();
            view.draw(context);
            context.restore();
        });

    }

    /**
     * 添加view
     * @param {View} view
     */
    addChild(view) {
        if (view.parent) {
            throw new Error("the view has related a container.");
        }
        // 指定父级关系
        view.parent = this;
        this.views.push(view);
    }

    /**
     * 删除view
     * @param {View} view
     */
    removeChild(view) {
        const index = this.views.indexOf(view);
        if (index > -1) {
            view.parent = null;
            this.views.splice(index, 1);
        }
    }
}

/**
 * 布局管理器
 */
class LayoutManager {

    /**
     * 布局操作
     * @param {Container} container
     * @param context
     */
    layout(container, context) {

    }

}

/**
 * 流式布局管理器
 */
class FlowLayoutManager extends LayoutManager{

    constructor() {
        super();

        this.horizonSpace = 0;
        this.verticalSpace = 0;
    }

    layout(container, context) {
        let x = 0;
        let y = 0;

        const availableWidth = container.width -
            (container.paddingLeft + container.paddingRight);

        for (let view of container.views) {
            view.measure(context);

            const viewOccupyWidth = this.horizonSpace + view.width;
            if (viewOccupyWidth + x > availableWidth) {
                x = 0;
                y += view.height + this.verticalSpace;
            }

            view.x = x;
            view.y = y;

            x += viewOccupyWidth + this.horizonSpace;
        }

    }
}

/**
 * 标签
 */
class Label extends View {

    constructor(x, y, text) {
        // 宽高自动计算
        super(x, y, 0, 0);

        this.text = text;

        this.padding = 0;
        this.fontColor = 'black';
        this.fontSize = 12;
        this.font = 'Arial';

    }

    /**
     * 动态测量宽高
     * @param context
     */
    measure(context) {
        context.font = `${this.fontSize}px ${this.font}`;
        const measureText = context.measureText(this.text);

        this.width = Math.ceil(measureText.width) + this.padding;
        this.height = this.fontSize + this.padding;
    }

    draw(context) {
        super.draw(context);
        context.fillStyle = this.fontColor;
        context.font = `${this.fontSize}px ${this.font}`;
        context.textBaseline = "top";
        context.fillText(this.text, this.x + this.padding / 2, this.y + this.padding / 2);

    }

}


