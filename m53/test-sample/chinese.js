// 这是全局配置变量
const config = { debug: true };

// 用户名称
const userName = '张三';

// 复杂的数据处理函数
function processData(data) {
  const result = []; // 存储结果的数组
  if (data.type === 'a') {
    result.push('类型A');
  } else if (data.type === 'b') {
    result.push('类型B');
  } else if (data.type === 'c') {
    result.push('类型C');
  } else if (data.type === 'd') {
    result.push('类型D');
  } else if (data.type === 'e') {
    result.push('类型E');
  } else if (data.type === 'f') {
    result.push('类型F');
  } else if (data.type === 'g') {
    result.push('类型G');
  } else if (data.type === 'h') {
    result.push('类型H');
  } else if (data.type === 'i') {
    result.push('类型I');
  } else if (data.type === 'j') {
    result.push('类型J');
  } else {
    result.push('未知类型');
  }
  return result;
}

let counter = 0; // 计数器
counter = counter + 1;
