use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use pulldown_cmark::{Parser, Event, Tag, TagEnd, Options};
use std::collections::HashMap;

#[derive(Serialize)]
struct Presentation {
    meta: PresentationMeta,
    slides: Vec<Slide>,
}

#[derive(Serialize)]
struct PresentationMeta {
    title: String,
    author: String,
    theme: String,
}

#[derive(Serialize)]
struct Slide {
    id: usize,
    elements: Vec<Element>,
    #[serde(skip_serializing_if = "Option::is_none")]
    style: Option<SlideStyle>,
    notes: String,
}

#[derive(Serialize, PartialEq)]
struct SlideStyle {
    #[serde(skip_serializing_if = "Option::is_none")]
    background: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    layout: Option<String>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Element {
    Heading { level: u8, text: String },
    Paragraph { content: Vec<InlineNode> },
    List { items: Vec<ListItem>, ordered: bool },
    Code { language: String, code: String },
    Image { url: String, alt: String, title: String },
    Blockquote { content: Vec<InlineNode> },
    Table { headers: Vec<String>, rows: Vec<Vec<String>> },
    ThematicBreak,
    Html { content: String },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum InlineNode {
    Text { value: String },
    Strong { content: Vec<InlineNode> },
    Emph { content: Vec<InlineNode> },
    Code { value: String },
    Link { url: String, text: String },
    Image { url: String, alt: String },
    SoftBreak,
    HardBreak,
    Html { content: String },
}

#[derive(Serialize)]
struct ListItem {
    content: Vec<InlineNode>,
    children: Vec<ListItem>,
}

#[wasm_bindgen]
pub fn parse_slides(input: &str) -> String {
    let result = std::panic::catch_unwind(|| {
        parse_slides_safe(input)
    });

    match result {
        Ok(json) => json,
        Err(_) => {
            r#"{"meta":{"title":"","author":"","theme":"default"},"slides":[{"id":0,"elements":[{"type":"paragraph","content":[{"type":"text","value":"解析错误：请简化 HTML 嵌套结构"}]}],"notes":""}]}"#.to_string()
        }
    }
}

fn parse_slides_safe(input: &str) -> String {
    let (meta, slides_content) = parse_frontmatter(input);
    let raw_slides = split_slides(&slides_content);
    let mut slides = Vec::new();

    for (i, content) in raw_slides.into_iter().enumerate() {
        let trimmed = content.trim();
        if trimmed.is_empty() {
            continue;
        }
        let (style, notes, clean_content) = parse_slide_meta(trimmed);
        let elements = parse_markdown_to_elements(clean_content);
        slides.push(Slide {
            id: i,
            elements,
            style: if style == SlideStyle::default_val() {
                None
            } else {
                Some(style)
            },
            notes,
        });
    }

    if slides.is_empty() {
        slides.push(Slide {
            id: 0,
            elements: vec![Element::Paragraph {
                content: vec![InlineNode::Text {
                    value: "No content".to_string(),
                }],
            }],
            style: None,
            notes: String::new(),
        });
    }

    let presentation = Presentation { meta, slides };
    serde_json::to_string(&presentation).unwrap_or_else(|e| {
        format!(r#"{{"meta":{{"title":"","author":"","theme":"default"}},"slides":[{{"id":0,"elements":[{{"type":"paragraph","content":[{{"type":"text","value":"序列化错误: {0}"}}]}}],"notes":""}}]"#, escape_json_str(&e.to_string()))
    })
}

fn escape_json_str(s: &str) -> String {
    s.replace('\\', "\\\\")
     .replace('"', "\\\"")
     .replace('\n', "\\n")
     .replace('\r', "\\r")
     .replace('\t', "\\t")
}

#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn parse_frontmatter(input: &str) -> (PresentationMeta, String) {
    let trimmed = input.trim_start();
    if !trimmed.starts_with("---") {
        return (
            PresentationMeta {
                title: String::new(),
                author: String::new(),
                theme: "default".to_string(),
            },
            input.to_string(),
        );
    }

    let rest = &trimmed[3..];
    if let Some(end_idx) = rest.find("\n---") {
        let frontmatter = &rest[..end_idx];
        let remaining = &rest[end_idx + 4..];
        let meta = parse_yaml_like(frontmatter);
        (meta, remaining.to_string())
    } else {
        (
            PresentationMeta {
                title: String::new(),
                author: String::new(),
                theme: "default".to_string(),
            },
            input.to_string(),
        )
    }
}

fn parse_yaml_like(input: &str) -> PresentationMeta {
    let mut title = String::new();
    let mut author = String::new();
    let mut theme = "default".to_string();

    for line in input.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("title:") {
            title = val.trim().trim_matches('"').trim_matches('\'').to_string();
        } else if let Some(val) = line.strip_prefix("author:") {
            author = val.trim().trim_matches('"').trim_matches('\'').to_string();
        } else if let Some(val) = line.strip_prefix("theme:") {
            theme = val.trim().trim_matches('"').trim_matches('\'').to_string();
        }
    }

    PresentationMeta { title, author, theme }
}

fn split_slides(input: &str) -> Vec<String> {
    let mut slides = Vec::new();
    let mut current = String::new();
    let mut in_code_block = false;

    for line in input.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            current.push_str(line);
            current.push('\n');
            continue;
        }

        if !in_code_block && trimmed == "---" {
            slides.push(current.clone());
            current.clear();
        } else {
            current.push_str(line);
            current.push('\n');
        }
    }

    if !current.trim().is_empty() {
        slides.push(current);
    }

    slides
}

fn parse_slide_meta(input: &str) -> (SlideStyle, String, &str) {
    let mut style = SlideStyle::default_val();
    let mut notes = String::new();
    let mut clean_start = 0;

    for line in input.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<!--") && trimmed.ends_with("-->") {
            let inner = trimmed[4..trimmed.len() - 3].trim();
            if inner.starts_with("slide:") {
                for pair in inner[6..].split(',') {
                    let pair = pair.trim();
                    if let Some(eq_idx) = pair.find('=') {
                        let key = pair[..eq_idx].trim();
                        let val = pair[eq_idx + 1..].trim().to_string();
                        match key {
                            "background" => style.background = Some(val),
                            "color" => style.color = Some(val),
                            "class" => style.class = Some(val),
                            "layout" => style.layout = Some(val),
                            _ => {}
                        }
                    }
                }
                clean_start += line.len() + 1;
                continue;
            } else if inner.starts_with("note:") {
                notes = inner[5..].trim().to_string();
                clean_start += line.len() + 1;
                continue;
            }
        }
        break;
    }

    (style, notes, &input[clean_start..])
}

impl SlideStyle {
    fn default_val() -> Self {
        SlideStyle {
            background: None,
            color: None,
            class: None,
            layout: None,
        }
    }
}

fn parse_markdown_to_elements(input: &str) -> Vec<Element> {
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    let parser = Parser::new_ext(input, opts);

    let mut elements = Vec::new();
    let mut inline_buffer: Vec<InlineNode> = Vec::new();
    let mut tag_depth_stack: Vec<u8> = Vec::new();

    for event in parser {
        match event {
            Event::Start(tag) => {
                let depth = tag_depth_stack.last().copied().unwrap_or(0);
                tag_depth_stack.push(depth + 1);

                match &tag {
                    Tag::Heading { level: _, .. } => {
                        flush_inline(&mut inline_buffer, &mut elements);
                    }
                    Tag::Paragraph => {
                        flush_inline(&mut inline_buffer, &mut elements);
                    }
                    Tag::CodeBlock(_) => {
                        flush_inline(&mut inline_buffer, &mut elements);
                    }
                    Tag::List(_) => {
                        flush_inline(&mut inline_buffer, &mut elements);
                    }
                    Tag::BlockQuote => {
                        flush_inline(&mut inline_buffer, &mut elements);
                    }
                    Tag::Image { dest_url, .. } => {
                        inline_buffer.push(InlineNode::Image {
                            url: dest_url.to_string(),
                            alt: String::new(),
                        });
                    }
                    Tag::Table(_) => {
                        flush_inline(&mut inline_buffer, &mut elements);
                    }
                    Tag::Strong => {}
                    Tag::Emphasis => {}
                    _ => {}
                }
            }
            Event::End(tag_end) => {
                tag_depth_stack.pop();

                match tag_end {
                    TagEnd::Heading(level) => {
                        let text = collect_text_from_inline(&inline_buffer);
                        elements.push(Element::Heading {
                            level: level as u8,
                            text,
                        });
                        inline_buffer.clear();
                    }
                    TagEnd::Paragraph => {
                        let content = std::mem::take(&mut inline_buffer);
                        if !content.is_empty() {
                            elements.push(Element::Paragraph { content });
                        }
                    }
                    TagEnd::CodeBlock => {
                        let code = collect_text_from_inline(&inline_buffer);
                        elements.push(Element::Code {
                            language: String::new(),
                            code: code.trim_end().to_string(),
                        });
                        inline_buffer.clear();
                    }
                    TagEnd::List(ordered) => {
                        if let Some(Element::List { ordered: ref mut o, .. }) = elements.last_mut() {
                            *o = ordered;
                        }
                    }
                    TagEnd::Item => {
                        let content = std::mem::take(&mut inline_buffer);
                        let item = ListItem {
                            content,
                            children: Vec::new(),
                        };
                        push_list_item(&mut elements, item, false);
                    }
                    TagEnd::BlockQuote => {
                        let content = std::mem::take(&mut inline_buffer);
                        elements.push(Element::Blockquote { content });
                    }
                    TagEnd::Table => {}
                    TagEnd::TableRow => {}
                    TagEnd::TableCell => {}
                    TagEnd::Image => {}
                    _ => {}
                }
            }
            Event::Text(text) => {
                inline_buffer.push(InlineNode::Text {
                    value: text.to_string(),
                });
            }
            Event::Code(code) => {
                inline_buffer.push(InlineNode::Code {
                    value: code.to_string(),
                });
            }
            Event::SoftBreak => {
                inline_buffer.push(InlineNode::SoftBreak);
            }
            Event::HardBreak => {
                inline_buffer.push(InlineNode::HardBreak);
            }
            Event::Html(html) => {
                elements.push(Element::Html {
                    content: html.to_string(),
                });
            }
            Event::FootnoteReference(_) => {}
            Event::TaskListMarker(_) => {
                inline_buffer.push(InlineNode::Text {
                    value: "☐ ".to_string(),
                });
            }
            Event::InlineHtml(html) => {
                inline_buffer.push(InlineNode::Html {
                    content: html.to_string(),
                });
            }
            Event::Rule => {
                elements.push(Element::ThematicBreak);
            }
        }
    }

    flush_inline(&mut inline_buffer, &mut elements);
    elements
}

fn flush_inline(buffer: &mut Vec<InlineNode>, elements: &mut Vec<Element>) {
    if !buffer.is_empty() {
        let content = std::mem::take(buffer);
        elements.push(Element::Paragraph { content });
    }
}

fn collect_text_from_inline(nodes: &[InlineNode]) -> String {
    let mut result = String::new();
    for node in nodes {
        match node {
            InlineNode::Text { value } => result.push_str(value),
            InlineNode::Code { value } => result.push_str(value),
            InlineNode::Strong { content } => result.push_str(&collect_text_from_inline(content)),
            InlineNode::Emph { content } => result.push_str(&collect_text_from_inline(content)),
            InlineNode::Link { text, .. } => result.push_str(text),
            InlineNode::SoftBreak => result.push(' '),
            InlineNode::HardBreak => result.push('\n'),
            InlineNode::Image { alt, .. } => result.push_str(alt),
            InlineNode::Html { content } => result.push_str(content),
        }
    }
    result
}

fn push_list_item(elements: &mut Vec<Element>, item: ListItem, _ordered: bool) {
    if let Some(Element::List { items, .. }) = elements.last_mut() {
        items.push(item);
    } else {
        elements.push(Element::List {
            items: vec![item],
            ordered: false,
        });
    }
}

#[derive(Serialize, Deserialize)]
struct ScssVariable {
    name: String,
    value: String,
    description: Option<String>,
    category: Option<String>,
}

#[derive(Serialize)]
struct ThemeResult {
    variables: Vec<ScssVariable>,
    css: String,
    raw_scss: String,
}

#[wasm_bindgen]
pub fn parse_scss_variables(input: &str) -> String {
    let result = std::panic::catch_unwind(|| parse_scss_safe(input));
    match result {
        Ok(json) => json,
        Err(_) => r#"{"variables":[],"css":"","raw_scss":""}"#.to_string(),
    }
}

fn parse_scss_safe(input: &str) -> String {
    let mut variables = Vec::new();
    let mut css_vars = Vec::new();
    let mut current_comment = String::new();
    let mut current_category = String::new();

    for raw_line in input.lines() {
        let line = raw_line.trim();

        if line.starts_with("//") {
            let comment = line[2..].trim();
            if let Some(cat) = comment.strip_prefix("@category:") {
                current_category = cat.trim().to_string();
            } else if !comment.is_empty() {
                current_comment = comment.to_string();
            }
            continue;
        }

        if line.is_empty() {
            current_comment.clear();
            continue;
        }

        if line.starts_with('$') && line.contains(':') {
            if let Some(colon_pos) = line.find(':') {
                let name = line[1..colon_pos].trim().to_string();
                let mut value = line[colon_pos + 1..].to_string();
                if value.ends_with(';') {
                    value.pop();
                }
                let value = value.trim().to_string();

                if !name.is_empty() && !value.is_empty() {
                    css_vars.push(format!("--{}: {};", name.replace('_', "-"), value));

                    let description = if current_comment.is_empty() {
                        None
                    } else {
                        Some(std::mem::take(&mut current_comment))
                    };

                    let category = if current_category.is_empty() {
                        None
                    } else {
                        Some(current_category.clone())
                    };

                    variables.push(ScssVariable {
                        name,
                        value,
                        description,
                        category,
                    });
                }
            }
        }
    }

    let mut css = String::from(":root {\n");
    for var in &css_vars {
        css.push_str("  ");
        css.push_str(var);
        css.push('\n');
    }
    css.push_str("}\n\n");

    css.push_str(".slide {\n");
    css.push_str("  background: var(--slide-bg, #1a1a2e);\n");
    css.push_str("  color: var(--text-color, #e0e0e0);\n");
    css.push_str("  font-family: var(--font-family, system-ui, sans-serif);\n");
    css.push_str("}\n\n");

    css.push_str(".slide h1 { font-size: var(--h1-size, 2.8rem); color: var(--heading-color, var(--primary, #e94560)); }\n");
    css.push_str(".slide h2 { font-size: var(--h2-size, 2rem); color: var(--heading-color, var(--primary, #e94560)); }\n");
    css.push_str(".slide h3 { font-size: var(--h3-size, 1.5rem); color: var(--heading-color, var(--primary, #e94560)); }\n");
    css.push_str(".slide p { font-size: var(--text-size, 1.1rem); line-height: var(--line-height, 1.7); }\n");
    css.push_str(".slide a { color: var(--link-color, var(--primary, #e94560)); }\n");
    css.push_str(".slide blockquote { border-left-color: var(--primary, #e94560); }\n");
    css.push_str(".slide code { background: var(--code-bg, rgba(255,255,255,0.1)); color: var(--code-color, var(--text-color)); }\n");
    css.push_str(".slide .code-block { background: var(--code-block-bg, rgba(0,0,0,0.3)); border-radius: var(--radius, 6px); }\n");

    let raw_scss = input.to_string();
    let result = ThemeResult { variables, css, raw_scss };

    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"variables":[],"css":"","raw_scss":""}"#.to_string())
}

#[wasm_bindgen]
pub fn merge_slides_with_theme(slides_json: &str, theme_json: &str) -> String {
    let result = std::panic::catch_unwind(|| {
        let mut slides: serde_json::Value = match serde_json::from_str(slides_json) {
            Ok(v) => v,
            Err(_) => return r#"{"slides":[],"theme":{}}"#.to_string(),
        };
        let theme: serde_json::Value = match serde_json::from_str(theme_json) {
            Ok(v) => v,
            Err(_) => return r#"{"slides":[],"theme":{}}"#.to_string(),
        };

        let mut result = serde_json::Map::new();
        result.insert("slides".to_string(), slides);
        result.insert("theme".to_string(), theme);

        serde_json::to_string(&result).unwrap_or_else(|_| r#"{"slides":[],"theme":{}}"#.to_string())
    });
    result.unwrap_or_else(|_| r#"{"slides":[],"theme":{}}"#.to_string())
}

#[wasm_bindgen]
pub fn get_default_scss() -> String {
    r#"// @category: 颜色
// 主色调
$primary: #e94560;
// 标题颜色
$heading_color: #e94560;
// 链接颜色
$link_color: #e94560;

// @category: 背景
// 幻灯片背景
$slide_bg: #1a1a2e;
// 代码块背景
$code_block_bg: rgba(0, 0, 0, 0.3);
// 行内代码背景
$code_bg: rgba(255, 255, 255, 0.1);

// @category: 文本
// 文本颜色
$text_color: #e0e0e0;
// 代码文本颜色
$code_color: #e0e0e0;
// 字体家族
$font_family: "Microsoft YaHei", "PingFang SC", sans-serif;
// 正文字号
$text_size: 1.1rem;
// 行高
$line_height: 1.7;

// @category: 标题字号
// H1 字号
$h1_size: 2.8rem;
// H2 字号
$h2_size: 2rem;
// H3 字号
$h3_size: 1.5rem;

// @category: 其他
// 圆角
$radius: 6px;
"#.to_string()
}
