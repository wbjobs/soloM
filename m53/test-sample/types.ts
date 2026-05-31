const tsVar: string = 'hello';

interface User {
  name: string;
  age: number;
}

function greet(user: User): string {
  let message = `Hello, ${user.name}`;
  if (user.age > 18) {
    message = `${message}, adult`;
  } else if (user.age > 12) {
    message = `${message}, teen`;
  } else if (user.age > 6) {
    message = `${message}, child`;
  } else if (user.age > 3) {
    message = `${message}, toddler`;
  } else if (user.age > 1) {
    message = `${message}, baby`;
  } else {
    message = `${message}, infant`;
  }
  return message;
}

const sum = (a: number, b: number): number => a + b;
