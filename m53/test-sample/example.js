const globalConfig = { debug: true };

const name = 'test';

function processData(data) {
  const result = [];
  if (data.type === 'a') {
    result.push('a');
  } else if (data.type === 'b') {
    result.push('b');
  } else if (data.type === 'c') {
    result.push('c');
  } else if (data.type === 'd') {
    result.push('d');
  } else if (data.type === 'e') {
    result.push('e');
  } else if (data.type === 'f') {
    result.push('f');
  } else if (data.type === 'g') {
    result.push('g');
  } else if (data.type === 'h') {
    result.push('h');
  } else if (data.type === 'i') {
    result.push('i');
  } else if (data.type === 'j') {
    result.push('j');
  } else {
    result.push('unknown');
  }
  return result;
}

const add = (a, b) => a + b;

let counter = 0;
counter = counter + 1;

function simpleFunction() {
  const x = 1;
  return x;
}
