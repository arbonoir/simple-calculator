// Enhanced calculator with history, parentheses, percent, keyboard-only mode
// Expression parsing via shunting-yard + RPN evaluator

const displayEl = document.getElementById('display');
const keysEl = document.getElementById('keys');
const keys = document.querySelectorAll('.key');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');
const keyboardOnlyToggle = document.getElementById('keyboardOnly');
const root = document.documentElement;

let current = '';
let history = loadHistory(); // [{expr, result}]

function updateDisplay() {
  displayEl.textContent = current === '' ? '0' : current;
}

function saveHistory() {
  try { localStorage.setItem('calc_history_v1', JSON.stringify(history)); } catch(e){}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('calc_history_v1');
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function renderHistory() {
  historyList.innerHTML = '';
  history.slice().reverse().forEach((item, idx) => {
    const li = document.createElement('li');
    li.tabIndex = 0;
    const expr = document.createElement('div');
    expr.className = 'expr';
    expr.textContent = item.expr;
    const res = document.createElement('div');
    res.className = 'res';
    res.textContent = item.result;
    li.appendChild(expr);
    li.appendChild(res);
    li.addEventListener('click', () => {
      current = item.expr;
      updateDisplay();
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        current = item.expr;
        updateDisplay();
      }
    });
    historyList.appendChild(li);
  });
}

// Append value (digit, operator, dot, parentheses, percent)
function appendValue(val) {
  // Prevent multiple leading zeros in a number segment
  if (/^\d$/.test(val)) {
    const parts = current.split(/[\+\-\*\/\(\)%]/);
    const last = parts[parts.length - 1] || '';
    if (last === '0') {
      // if only "0" and adding another digit, replace it
      current = current.slice(0, -1) + val;
      updateDisplay();
      return;
    }
  }

  // Prevent multiple dots in a single number
  if (val === '.') {
    const parts = current.split(/[\+\-\*\/\(\)%]/);
    const last = parts[parts.length - 1];
    if ((last || '').includes('.')) return;
    if (last === '') val = '0.';
  }

  // Don't allow '%' at start
  if (val === '%' && current === '') return;

  current += val;
  updateDisplay();
}

// Backspace
function backspace() {
  current = current.slice(0, -1);
  updateDisplay();
}

// Clear
function clearAll() {
  current = '';
  updateDisplay();
}

// Tokenize expression into numbers, operators, parentheses, percent
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }

    // number (including decimals)
    if (/\d|\./.test(ch)) {
      let num = ch;
      i++;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i++];
      }
      // normalize multiple dots -> invalid but will be caught later
      tokens.push({type:'number', value:num});
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' ) {
      // handle unary minus: if previous token is null or operator or '(' then treat '-' as unary by inserting 0 before it
      if (ch === '-' && (tokens.length === 0 || (tokens[tokens.length-1].type === 'operator' && tokens[tokens.length-1].value !== '%') || tokens[tokens.length-1].type === 'left_paren')) {
        tokens.push({type:'number', value:'0'});
      }
      tokens.push({type:'operator', value:ch});
      i++;
      continue;
    }

    if (ch === '(') { tokens.push({type:'left_paren'}); i++; continue; }
    if (ch === ')') { tokens.push({type:'right_paren'}); i++; continue; }
    if (ch === '%') { tokens.push({type:'percent'}); i++; continue; }

    // unknown character -> invalid
    throw new Error('Invalid character: ' + ch);
  }
  return tokens;
}

// Shunting-yard: produce RPN (array)
function toRPN(tokens) {
  const output = [];
  const ops = [];
  const precedence = {'+':1,'-':1,'*':2,'/':2};
  const isLeftAssoc = {'+':true,'-':true,'*':true,'/':true};

  tokens.forEach(token => {
    if (token.type === 'number') {
      output.push(token);
    } else if (token.type === 'percent') {
      // percent is postfix unary operator: push directly to output after the number
      output.push(token);
    } else if (token.type === 'operator') {
      const o1 = token.value;
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.type === 'operator') {
          const o2 = top.value;
          if ((isLeftAssoc[o1] && precedence[o1] <= precedence[o2]) || (!isLeftAssoc[o1] && precedence[o1] < precedence[o2])) {
            output.push(ops.pop());
            continue;
          }
        }
        break;
      }
      ops.push(token);
    } else if (token.type === 'left_paren') {
      ops.push(token);
    } else if (token.type === 'right_paren') {
      let found = false;
      while (ops.length > 0) {
        const top = ops.pop();
        if (top.type === 'left_paren') { found = true; break; }
        output.push(top);
      }
      if (!found) throw new Error('Mismatched parentheses');
    }
  });

  while (ops.length > 0) {
    const top = ops.pop();
    if (top.type === 'left_paren' || top.type === 'right_paren') throw new Error('Mismatched parentheses');
    output.push(top);
  }

  return output;
}

// Evaluate RPN
function evalRPN(rpn) {
  const stack = [];
  for (const token of rpn) {
    if (token.type === 'number') {
      const n = Number(token.value);
      if (!isFinite(n)) throw new Error('Invalid number');
      stack.push(n);
    } else if (token.type === 'percent') {
      if (stack.length < 1) throw new Error('Percent error');
      const v = stack.pop();
      stack.push(v / 100);
    } else if (token.type === 'operator') {
      if (stack.length < 2) throw new Error('Operator error');
      const b = stack.pop();
      const a = stack.pop();
      let res;
      switch (token.value) {
        case '+': res = a + b; break;
        case '-': res = a - b; break;
        case '*': res = a * b; break;
        case '/':
          if (b === 0) throw new Error('Division by zero');
          res = a / b;
          break;
        default: throw new Error('Unknown operator');
      }
      stack.push(res);
    } else {
      throw new Error('Unexpected token in RPN');
    }
  }
  if (stack.length !== 1) throw new Error('Invalid expression');
  return stack[0];
}

// Evaluate expression string safely
function evaluateExpression() {
  if (!current) return;
  try {
    const tokens = tokenize(current);
    const rpn = toRPN(tokens);
    let result = evalRPN(rpn);
    if (!isFinite(result) || Number.isNaN(result)) throw new Error('Math error');

    // Round to reasonable precision
    result = Math.round((result + Number.EPSILON) * 1e12) / 1e12;

    // Save to history
    history.push({expr: current, result: String(result)});
    // keep only last 200
    if (history.length > 200) history.shift();
    saveHistory();
    renderHistory();

    current = String(result);
    updateDisplay();
  } catch (e) {
    displayEl.textContent = 'Error';
    current = '';
  }
}

// Attach click handlers
keys.forEach(button => {
  button.addEventListener('click', () => {
    const val = button.dataset.value;
    const action = button.dataset.action;

    if (action === 'clear') {
      clearAll();
      return;
    }
    if (action === 'backspace') {
      backspace();
      return;
    }
    if (action === 'equals') {
      evaluateExpression();
      return;
    }
    if (val !== undefined) {
      appendValue(val);
    }
  });
});

// Keyboard support
window.addEventListener('keydown', (e) => {
  const key = e.key;

  if ((/^[0-9]$/).test(key)) { appendValue(key); e.preventDefault(); return; }
  if (key === '.') { appendValue('.'); e.preventDefault(); return; }
  if (key === '+' || key === '-' || key === '*' || key === '/') { appendValue(key); e.preventDefault(); return; }
  if (key === '%' ) { appendValue('%'); e.preventDefault(); return; } // Shift+5 typically yields %
  if (key === '(' || key === ')') { appendValue(key); e.preventDefault(); return; }

  if (key === 'Enter' || key === '=') { evaluateExpression(); e.preventDefault(); return; }
  if (key === 'Backspace') { backspace(); e.preventDefault(); return; }
  if (key === 'Escape') { clearAll(); e.preventDefault(); return; }
});

// History interactivity
clearHistoryBtn.addEventListener('click', () => {
  history = [];
  saveHistory();
  renderHistory();
});

// Keyboard-only toggle
keyboardOnlyToggle.addEventListener('change', (e) => {
  if (keyboardOnlyToggle.checked) {
    document.body.classList.add('keyboard-only');
  } else {
    document.body.classList.remove('keyboard-only');
  }
});

// Initialize
renderHistory();
updateDisplay();