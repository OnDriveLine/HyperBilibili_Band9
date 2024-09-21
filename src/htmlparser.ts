// 定义 HtmlDocument 接口
interface HtmlDocument {
    type: string; // DOM 节点类型，例如 p, h1, img 等
    text?: string; // 文本内容
    style?: { [key: string]: string }; // 行内样式
    attributes?: { [key: string]: string }; // 其他属性
    children?: HtmlDocument[]; // 子节点
}

// HTML 实体映射表
const htmlEntities: { [key: string]: string } = {
    nbsp: ' ', // 空格
    lt: '<',   // 小于号
    gt: '>',   // 大于号
    amp: '&',  // 和号
    quot: '"', // 引号
    apos: "'", // 单引号
    // 可以在这里扩展其他常用的 HTML 实体
};

// 处理转义符，将 &nbsp; 等转义符转换为对应的字符
function decodeEntities(text: string): string {
    return text.replace(/&([^;]+);/g, (match, entity) => {
        return htmlEntities[entity] || match; // 如果实体存在，则替换；否则保留原样
    });
}

// 移除 HTML 标签，保留纯文本
function stripHtmlTags(html: string): string {
    return html.replace(/<\/?[^>]+(>|$)/g, "");
}

export function parseContentHtml(html: string): HtmlDocument[] {
    const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g; // 匹配 HTML 标签及其内容
    const selfClosingTagRegex = /<(\w+)([^>]*)\/>/g; // 匹配自闭合标签

    let elements: HtmlDocument[] = [];
    let lastIndex = 0; // 上一次匹配结束的位置

    // 处理自闭合标签
    html = html.replace(selfClosingTagRegex, (match, tagName, attributes) => {
        const element: HtmlDocument = {
            type: tagName,
            attributes: parseAttributes(attributes),
            style: parseStyle(attributes),
            children: [],
        };
        elements.push(element);
        return ''; // 移除匹配的自闭合标签
    });

    let match;
    while ((match = tagRegex.exec(html)) !== null) {
        const [fullMatch, tagName, attributes, innerHTML] = match;

        // 捕获当前标签之前的文本节点
        if (match.index > lastIndex) {
            const textContent = html.slice(lastIndex, match.index);
            if (textContent.trim()) {
                elements.push({
                    type: 'text',
                    text: decodeEntities(stripHtmlTags(textContent.trim())),  // 移除HTML标签
                });
            }
        }

        // 如果当前标签是 p 或 h1 之类的标签，直接将内容作为文本处理
        if (['p', 'h1', 'h2', 'span', 'strong', 'blockquote', 'a'].includes(tagName)) {
            const element: HtmlDocument = {
                type: tagName,
                style: parseStyle(attributes),
                attributes: parseAttributes(attributes),
                text: decodeEntities(stripHtmlTags(innerHTML.trim())),  // 移除HTML标签
            };
            elements.push(element);
        } else {
            // 对于其他标签，递归解析子元素
            const children = parseContentHtml(innerHTML);

            const element: HtmlDocument = {
                type: tagName,
                style: parseStyle(attributes),
                attributes: parseAttributes(attributes),
                children: children.length > 0 ? children : undefined,
            };

            elements.push(element);
        }

        lastIndex = tagRegex.lastIndex; // 更新 lastIndex
    }

    // 捕获最后一个标签之后的文本节点
    if (lastIndex < html.length) {
        const textContent = html.slice(lastIndex);
        if (textContent.trim()) {
            elements.push({
                type: 'text',
                text: decodeEntities(stripHtmlTags(textContent.trim())),  // 移除HTML标签
            });
        }
    }

    return elements;
}

// 解析行内样式
function parseStyle(attributes: string): { [key: string]: string } | undefined {
    const styleMatch = attributes.match(/style="([^"]*)"/);
    if (styleMatch) {
        const styleString = styleMatch[1];
        return styleString.split(';').reduce((styleObj, stylePair) => {
            const [key, value] = stylePair.split(':').map(s => s.trim());
            if (key && value) {
                styleObj[key] = value;
            }
            return styleObj;
        }, {} as { [key: string]: string });
    }
    return undefined;
}

// 解析其他属性
function parseAttributes(attributeString: string): { [key: string]: string } {
    const attrRegex = /(\w+)="([^"]*)"/g;
    let attributes: { [key: string]: string } = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attributeString)) !== null) {
        attributes[attrMatch[1]] = attrMatch[2];
    }
    return attributes;
}