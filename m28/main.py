from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
import math
import uuid
from decimal import Decimal, getcontext, DivisionByZero, InvalidOperation
from typing import Dict, Optional

getcontext().prec = 50

app = FastAPI(title="数学表达式计算服务", description="基于调度场算法的表达式计算器")

session_store: Dict[str, Dict[str, Decimal]] = {}


class CalculationRequest(BaseModel):
    expression: str


class CalculationResponse(BaseModel):
    expression: str
    result: str
    rpn: list
    session_id: str


class VariableRequest(BaseModel):
    name: str
    value: str


class VariableResponse(BaseModel):
    name: str
    value: str
    session_id: str


class VariablesResponse(BaseModel):
    variables: Dict[str, str]
    session_id: str


OPERATORS = {
    '+': {'precedence': 1, 'associativity': 'left'},
    '-': {'precedence': 1, 'associativity': 'left'},
    '*': {'precedence': 2, 'associativity': 'left'},
    '/': {'precedence': 2, 'associativity': 'left'},
    '^': {'precedence': 4, 'associativity': 'right'}
}

FUNCTIONS = {'sin', 'cos', 'tan', 'sqrt', 'log', 'ln', 'abs'}


def get_or_create_session(session_id: Optional[str] = None) -> tuple:
    if session_id and session_id in session_store:
        return session_id, session_store[session_id]
    new_session_id = str(uuid.uuid4())
    session_store[new_session_id] = {}
    return new_session_id, session_store[new_session_id]


def tokenize(expression: str) -> list:
    tokens = []
    i = 0
    n = len(expression)
    
    while i < n:
        char = expression[i]
        
        if char.isspace():
            i += 1
            continue
        
        if char.isdigit() or char == '.':
            j = i
            while j < n and (expression[j].isdigit() or expression[j] == '.'):
                j += 1
            tokens.append(expression[i:j])
            i = j
            continue
        
        if char.isalpha():
            j = i
            while j < n and expression[j].isalpha():
                j += 1
            tokens.append(expression[i:j])
            i = j
            continue
        
        if char in OPERATORS or char in '(),':
            tokens.append(char)
            i += 1
            continue
        
        raise ValueError(f"无法识别的字符: {char}")
    
    return tokens


def shunting_yard(tokens: list) -> list:
    output = []
    stack = []
    
    for i, token in enumerate(tokens):
        if token.replace('.', '', 1).isdigit():
            output.append(token)
        
        elif token in FUNCTIONS:
            stack.append(token)
        
        elif token.isalpha() and token not in FUNCTIONS:
            output.append(f'var:{token}')
        
        elif token == ',':
            while stack and stack[-1] != '(':
                output.append(stack.pop())
            if not stack:
                raise ValueError("括号不匹配")
        
        elif token in OPERATORS:
            if token == '-' and (i == 0 or tokens[i-1] in OPERATORS or tokens[i-1] == '(' or tokens[i-1] == ','):
                stack.append('u-')
                continue
            
            while stack:
                top = stack[-1]
                if top == 'u-':
                    output.append(stack.pop())
                    continue
                if top not in OPERATORS:
                    break
                if (OPERATORS[top]['precedence'] > OPERATORS[token]['precedence'] or
                    (OPERATORS[top]['precedence'] == OPERATORS[token]['precedence'] and
                     OPERATORS[token]['associativity'] == 'left')):
                    output.append(stack.pop())
                else:
                    break
            stack.append(token)
        
        elif token == '(':
            stack.append(token)
        
        elif token == ')':
            while stack and stack[-1] != '(':
                output.append(stack.pop())
            if not stack:
                raise ValueError("括号不匹配")
            stack.pop()
            if stack and stack[-1] in FUNCTIONS:
                output.append(stack.pop())
    
    while stack:
        top = stack.pop()
        if top == '(':
            raise ValueError("括号不匹配")
        output.append(top)
    
    return output


def decimal_pow(base: Decimal, exp: Decimal) -> Decimal:
    exp_float = float(exp)
    if exp_float == int(exp_float) and exp_float >= 0:
        return base ** int(exp_float)
    return Decimal(math.pow(float(base), exp_float))


def evaluate_rpn(rpn: list, variables: Dict[str, Decimal] = None) -> Decimal:
    stack = []
    if variables is None:
        variables = {}
    
    for token in rpn:
        if token.replace('.', '', 1).isdigit():
            stack.append(Decimal(token))
        
        elif token.startswith('var:'):
            var_name = token[4:]
            if var_name not in variables:
                raise ValueError(f"未定义的变量: {var_name}")
            stack.append(variables[var_name])
        
        elif token == 'u-':
            if not stack:
                raise ValueError("表达式无效")
            stack.append(-stack.pop())
        
        elif token in OPERATORS:
            if len(stack) < 2:
                raise ValueError("表达式无效")
            b = stack.pop()
            a = stack.pop()
            
            if token == '+':
                stack.append(a + b)
            elif token == '-':
                stack.append(a - b)
            elif token == '*':
                stack.append(a * b)
            elif token == '/':
                if b == 0:
                    raise ValueError("除数不能为零")
                try:
                    stack.append(a / b)
                except DivisionByZero:
                    raise ValueError("除数不能为零")
            elif token == '^':
                try:
                    stack.append(decimal_pow(a, b))
                except InvalidOperation:
                    raise ValueError("幂运算无效")
        
        elif token in FUNCTIONS:
            if not stack:
                raise ValueError("表达式无效")
            x = stack.pop()
            
            if token == 'sin':
                stack.append(Decimal(math.sin(float(x))))
            elif token == 'cos':
                stack.append(Decimal(math.cos(float(x))))
            elif token == 'tan':
                stack.append(Decimal(math.tan(float(x))))
            elif token == 'sqrt':
                if x < 0:
                    raise ValueError("平方根不能为负数")
                stack.append(x.sqrt())
            elif token == 'log':
                if x <= 0:
                    raise ValueError("对数参数必须为正")
                stack.append(Decimal(math.log10(float(x))))
            elif token == 'ln':
                if x <= 0:
                    raise ValueError("对数参数必须为正")
                stack.append(Decimal(math.log(float(x))))
            elif token == 'abs':
                stack.append(abs(x))
    
    if len(stack) != 1:
        raise ValueError("表达式无效")
    
    return stack[0]


@app.post("/calculate", response_model=CalculationResponse)
async def calculate(
    request: CalculationRequest,
    x_session_id: Optional[str] = Header(None)
):
    try:
        session_id, variables = get_or_create_session(x_session_id)
        
        tokens = tokenize(request.expression)
        rpn = shunting_yard(tokens)
        result = evaluate_rpn(rpn, variables)
        
        result_str = format_decimal(result)
        
        return CalculationResponse(
            expression=request.expression,
            result=result_str,
            rpn=rpn,
            session_id=session_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DivisionByZero:
        raise HTTPException(status_code=400, detail="除数不能为零")
    except InvalidOperation as e:
        raise HTTPException(status_code=400, detail=f"无效的数学运算: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"计算错误: {str(e)}")


@app.post("/variable", response_model=VariableResponse)
async def set_variable(
    request: VariableRequest,
    x_session_id: Optional[str] = Header(None)
):
    try:
        session_id, variables = get_or_create_session(x_session_id)
        
        if not request.name.isalpha():
            raise ValueError("变量名只能包含字母")
        if request.name in FUNCTIONS:
            raise ValueError(f"变量名不能与函数名重复: {request.name}")
        
        value = Decimal(request.value)
        variables[request.name] = value
        
        return VariableResponse(
            name=request.name,
            value=format_decimal(value),
            session_id=session_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"设置变量错误: {str(e)}")


@app.get("/variables", response_model=VariablesResponse)
async def get_variables(
    x_session_id: Optional[str] = Header(None)
):
    session_id, variables = get_or_create_session(x_session_id)
    
    formatted_vars = {
        name: format_decimal(value)
        for name, value in variables.items()
    }
    
    return VariablesResponse(
        variables=formatted_vars,
        session_id=session_id
    )


@app.delete("/variables/{name}")
async def delete_variable(
    name: str,
    x_session_id: Optional[str] = Header(None)
):
    if not x_session_id or x_session_id not in session_store:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    variables = session_store[x_session_id]
    if name not in variables:
        raise HTTPException(status_code=404, detail=f"变量不存在: {name}")
    
    del variables[name]
    return {"message": f"变量 {name} 已删除", "session_id": x_session_id}


def format_decimal(value: Decimal) -> str:
    if value == value.to_integral_value():
        return str(value.to_integral_value())
    s = format(value, 'f')
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    return s


@app.get("/")
async def root():
    return {
        "message": "数学表达式计算服务",
        "usage": "POST /calculate with {\"expression\": \"3 + 4 * 2\"}",
        "supported_operators": "+, -, *, /, ^ (幂运算)",
        "supported_functions": "sin, cos, tan, sqrt, log, ln, abs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
