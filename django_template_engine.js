(function(global){
/*
This is the Django template system.

How it works:

The Lexer.tokenize() method converts a template string (i.e., a string
containing markup with custom template tags) to tokens, which can be either
plain text (TokenType.TEXT), variables (TokenType.VAR), or block statements
(TokenType.BLOCK).

The Parser() class takes a list of tokens in its constructor, and its parse()
method returns a compiled template -- which is, under the hood, a list of
Node objects.

Each Node is responsible for creating some sort of output -- e.g. simple text
(TextNode), variable values in a given context (VariableNode), results of basic
logic (IfNode), results of looping (ForNode), or anything else. The core Node
types are TextNode, VariableNode, IfNode and ForNode, but plugin modules can
define their own custom node types.

Each Node has a render() method, which takes a Context and returns a string of
the rendered node. For example, the render() method of a Variable Node returns
the variable's value as a string. The render() method of a ForNode returns the
rendered output of whatever was inside the loop, recursively.

The Template class is a convenient wrapper that takes care of template
compilation and rendering.

Usage:

Create a compiled template object with a template_string, then call render()
with a context. In the compilation stage, the TemplateSyntaxError exception
will be raised if the template doesn't have proper syntax.

Sample code:

>>> s = '<html>{% if test %}<h1>{{ varvalue }}</h1>{% endif %}</html>'
>>> t = DjangoTemplateEngine.getTemplateFromString(s)

(t is now a compiled template, and its render() method can be called multiple
times with multiple contexts)

>>> c = new DjangoTemplateEngine.Context({'test':true, 'varvalue': 'Hello'})
>>> t.render(c)
'<html><h1>Hello</h1></html>'
>>> c = new DjangoTemplateEngine.Context({'test':false, 'varvalue': 'Hello'})
>>> t.render(c)
'<html></html>'
*/


// template syntax constants
var FILTER_SEPARATOR = '|';
var FILTER_ARGUMENT_SEPARATOR = ':';
var VARIABLE_ATTRIBUTE_SEPARATOR = '.';
var BLOCK_TAG_START = '{%';
var BLOCK_TAG_END = '%}';
var VARIABLE_TAG_START = '{{';
var VARIABLE_TAG_END = '}}';
var COMMENT_TAG_START = '{#';
var COMMENT_TAG_END = '#}';
var TRANSLATOR_COMMENT_MARK = 'Translators';
var SINGLE_BRACE_START = '{';
var SINGLE_BRACE_END = '}';


var setDefaults = function(opts, defaults){
    if (!opts) return defaults;
    var result = {};

    Object.entries(opts).forEach(function(entry){
        result[entry[0]] = entry[1];
    });

    Object.keys(defaults).forEach(function(optName){
        if (!result.hasOwnProperty(optName))
            result[optName] = defaults[optName];
    });

    return result;  
}

var DJANGO_TEMPLATE_SETTINGS = setDefaults(global.DJANGO_TEMPLATE_SETTINGS, {
    AUTOESCAPE: true,
    DEBUG: false,
    LIBRARIES: null,
    CONTEXT_BUILTINS: {'True': true, 'False': false, 'None': null},
    STRING_IF_INVALID: "", 
    DEFAULT_DATE_TIME_FORMAT: 'j N, g:i:a',
    DEFAULT_TIME_FORMAT: 'G:i:s',
    VARIABLE_NAME_MISSING_WARNING: "Missing variable '%s'"
});


function getOrDefault(value, default_value){
    if (value === null || value === undefined) {
      return default_value;
    }
    return value;
}

var isNumber = function(value) {return typeof value === 'number';}
var isString = function(value) {return typeof value === 'string';}
// TODO: isSymbol. There is a better way?
var isSymbol = function(value) {return typeof value === 'symbol';}
var isFunction = function(value) {return typeof value === 'function';}

function isFunction(obj) {
  return Object.prototype.toString.call(obj) === '[object Function]';
}

var isObject = function(val) {
    return obj !== null && typeof obj == 'object';
    // return Object(val) === val also works, but is slower, especially if val is
    // not an object.
};

var isArray = Array.isArray || function(obj) {
    // return obj instanceof Array
    return Object.prototype.toString.call(obj) === '[object Array]';
};

var isDate = function(val) {
    return val instanceof Date;
};

var objectIsEqual = function(obj1, obj2){
    var key;

    var keys1 = Object.keys(obj1);
    if (keys1.length !== Object.keys(obj2).length) return false;

    for (var i = 0, keys1Len=keys1.length; i < keys1Len; i++){
        key = keys1[i];
        if (obj1[key] !== obj2[key]) return false;
    }

    return true;
}


var partial = function(fn, var_args) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function() {
        // Prepend the bound arguments to the current arguments.
        var newArgs = Array.prototype.slice.call(arguments);
        newArgs.unshift.apply(newArgs, args);
        return fn.apply(this, newArgs);
    };
};


function __import(obj, src){
    var own, key;
    own = {}.hasOwnProperty;
    for (key in src) {
      if (own.call(src, key)) {
        obj[key] = src[key];
      }
    }
    return obj;
}

var objectGetPath = function( obj, path ){
    var p = isArray(path) ? path : path.split(".");
    for( var i=0, j=p.length; i<j; ++i )
    if( !(obj = obj[ p[ i ] ]) )
        break;
    return obj;
}

var dictsort = function(value, key) {
  value.sort((a, b) => {
    const aValue = objectGetPath(a, key);
    const bValue = objectGetPath(b, key);
    if (aValue < bValue) {
      return -1;
    }
    if (aValue > bValue) {
      return 1;
    }

    return 0;
  });

  return value;
}


function groupBy(arr, criteria) {
    const newObj = arr.reduce(function (acc, currentValue) {
        var key = criteria(currentValue);

        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(currentValue);
        return acc;
    }, {});
    return newObj;
}


// TODO: objectMerge y extend son practicamente identicas


function objectMerge(obj1, obj2) {    
    if (!obj2)
        return obj1;

    Object.keys(obj2).forEach(k => {
        obj1[k] = obj2[k];
    });
    return obj1;
}

function copyDict(obj){
    var new_obj = Object.create(null);
    
    return objectMerge(new_obj, obj);
}


function slice_list(value, start, stop, step){

    // Return a slice of the list using the same syntax as Python's list slicing.
    if (start === null) {
        start = 0;
    } else {
        if (start < 0){
            start = value.length + start;
            start = Math.max(0, start);
        } else if (start > 0){
            start = Math.min(start, value.length);
        }
    }
       
    if (stop === null) {
        stop = value.length;
    } else {
        if (stop < 0){
            stop = value.length + stop;
            stop = Math.max(0, stop);
        } else if (stop > 0){
            stop = Math.min(stop, value.length);
        }        
    }

    if (step === null) {
        step = 1;
    }

    var result = [];

    if (step > 0){
        for (var i = start; i < stop; i += step){
            result.push(value[i]);
        }
    } else {
        for (var i = start; i > stop; i += step){
            result.push(value[i]);
        }
    }

    if (isString(value)){
        result = result.join("");
    }

    return result;
}


var repeat = function(ele, num) {
  var arr = new Array(num);
  for (var i = 0; i < num; i++) {
    arr[i] = ele;
  }

  return arr;
};


var multilineFuncString = function(f){
    var s = f.toString()
    return s.substring(s.indexOf("/**") + 3 , s.lastIndexOf("*/"));
};

var inherits = (function () {
    var F = function () {};

    return function (C, P) {
        if (Object.create){
            C.prototype =  Object.create( P.prototype, {
                constructor: {
                    value: C,
                },
                __super__: {
                    value: P.prototype
                }
            });
        } else {
            F.prototype = P.prototype;
            C.prototype = new F();

            C.prototype.constructor = C;
            C.prototype.__super__ = P.prototype;
        }

        C.baseConstructor = P;
    }
}());


function inOperator(key, val) {
  if (isArray(val) || isString(val)) {
    return val.indexOf(key) !== -1;
  } else if (isObject(val)) {
    // val[key] !== undefined
    return key in val;
  }
  throw new TemplateError('Cannot use "in" operator to search for "' + key + '" in unexpected types.');
}

function __in(obj, container){
    if (obj instanceof Array) {
      return Array.prototype.indexOf.call(container, obj) > -1;
    }

    return container[obj] != null;
}

function in_operator(x, y) {
  if(!(x instanceof Object) && y instanceof Object) {
    if(!(y && 'length' in y)) {
      y = keys(y)
    }
  }

  if(typeof(x) == 'string' && typeof(y) =='string') {
    return y.indexOf(x) !== -1
  }

  if(x === undefined || x === null)
    return false

  if(y === undefined || y === null)
    return false

  for(var found = false, i = 0, len = y.length; i < len && !found; ++i) {
    var rhs = y[i]
    if(x instanceof Array) {
      for(var idx = 0,
        equal = x.length == rhs.length,
        xlen = x.length;
        idx < xlen && equal; ++idx) {

        equal = (x[idx] === rhs[idx])
      }
      found = equal

    } else if(x instanceof Object) {
      if(x === rhs) {
        return true
      }
      var xkeys = keys(x),
        rkeys = keys(rhs)

      if(xkeys.length === rkeys.length) { 
        for(var i = 0, len = xkeys.length, equal = true;
          i < len && equal;
          ++i) {
          equal = xkeys[i] === rkeys[i] &&
              x[xkeys[i]] === rhs[rkeys[i]]
        }
        found = equal
      } 
    } else {
      found = x == rhs
    }
  }
  return found
}

function hasOwnProperty(obj, propertyName){
    return Object.hasOwnProperty.call(obj, propertyName);
}

function _(arg){return arg}
function pgettext(ctx, arg){return arg}


function gettext(msgid, messageContext){
    // TODO
}

function localize(value, useL10n){
    // TODO
    return value
}

/** 
 * Huge thanks to TJ Holowaychuk <http://tjholowaychuk.com/>,  
 * this is mostly his code from the 'ext' nodejs module.
 */
var sprintf = function(str) {
  var args = arguments, i = 0
  return str.replace(/%(-)?(\d+)?(\.\d+)?(\w)/g, function(_, flag, width, precision, specifier){
    var arg = args[++i],
        width = parseInt(width),
        precision = parseInt((String(precision)).slice(1))
    function pad(str) {
      if (typeof str != 'string') return str
      return width
        ? flag == '-'
          ? str.padEnd(width)
          : str.padStart(width)
        : str
    }
    function numeric(str, base, fn) {
      fn = fn || parseInt
      return isNaN((fn)(str)) ?
        console.error('%' + specifier + ' requires a number of a numeric string') :
          (fn)(str).toString(base)
    }
    switch (specifier) {
      case 'c':
        switch (typeof arg) {
          case 'string': return pad(arg.charAt(0))
          case 'number': return pad(String.fromCharCode(arg))
          default:       console.error('%c requires a string or char code integer')
        }
      case 'M':
        return typeof arg == 'string' ?
          pad(arg.md5) :
            console.error('%M requires a string')
      case 's':
        return pad(arg)
      case 'C':
        return pad(Number.prototype.__lookupGetter__('currency')
                         .call(parseFloat(numeric(arg, 10, parseFloat)).toFixed(2)))
      case 'd':
        return pad(numeric(arg))
      case 'M':
        return pad(numeric(arg))
      case 'D':
        return pad(parseInt(numeric(arg)).ordinalize)
      case 'f':
        arg = numeric(arg, 10, parseFloat)
        if (precision) arg = parseFloat(arg).toFixed(precision)
        return pad(arg)
      case 'b':
        return pad(numeric(arg, 2))
      case 'o':
        return pad(numeric(arg, 8))
      case 'x':
      case 'X':
        arg = numeric(arg, 16)
        if (specifier == 'X') arg = arg.uppercase
        return pad(arg.length === 1 ? '0' + arg : arg)
      default:
        console.error('%' + specifier + ' is not a valid specifier')
    }
  })
}

function normalizeNewlines(value){
    return value.replace(/\r\n|\r/g, '\n');
}

function capfirst(str) {
  return str.replace(/^(.{1})/, function(a, m) { return m.toUpperCase() });
}

function centerText(text, len, character_filler){
    if (character_filler === undefined) character_filler = ' ';

    len -= text.length;
    if(len < 0) { 
        return text;
    }

    var len_half = len/2.0
        , arr = []
        , idx = Math.floor(len_half)

    while(idx-- > 0) {
        arr.push(character_filler)
    }

    arr = arr.join('')
    text = arr + text + arr
    if((len_half - Math.floor(len_half)) > 0) {
        text = text.length % 2 == 0 ? character_filler + text : text + character_filler;
    }
    return text;
}


function strtoarray(str) {
    var arr = [];
    for(var i = 0, len = str.length; i < len; ++i)
        arr.push(str.charAt(i));
    return arr
}


var translateMap = function(value, map){
  var targets = Object.keys(map)
    .join('|')
    .replace('\\', '\\\\');
  var regex = new RegExp(`(${targets})`, 'g');
  return value.toString().replace(regex, char => map[char]);
};


var LoremIpsum = (function(){
    const COMMON_P = [
      'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod ',
      'tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim ',
      'veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea ',
      'commodo consequat. Duis aute irure dolor in reprehenderit in voluptate ',
      'velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint ',
      'occaecat cupidatat non proident, sunt in culpa qui officia deserunt ',
      'mollit anim id est laborum.'
    ];

    const WORDS = [
      'exercitationem',
      'perferendis',
      'perspiciatis',
      'laborum',
      'eveniet',
      'sunt',
      'iure',
      'nam',
      'nobis',
      'eum',
      'cum',
      'officiis',
      'excepturi',
      'odio',
      'consectetur',
      'quasi',
      'aut',
      'quisquam',
      'vel',
      'eligendi',
      'itaque',
      'non',
      'odit',
      'tempore',
      'quaerat',
      'dignissimos',
      'facilis',
      'neque',
      'nihil',
      'expedita',
      'vitae',
      'vero',
      'ipsum',
      'nisi',
      'animi',
      'cumque',
      'pariatur',
      'velit',
      'modi',
      'natus',
      'iusto',
      'eaque',
      'sequi',
      'illo',
      'sed',
      'ex',
      'et',
      'voluptatibus',
      'tempora',
      'veritatis',
      'ratione',
      'assumenda',
      'incidunt',
      'nostrum',
      'placeat',
      'aliquid',
      'fuga',
      'provident',
      'praesentium',
      'rem',
      'necessitatibus',
      'suscipit',
      'adipisci',
      'quidem',
      'possimus',
      'voluptas',
      'debitis',
      'sint',
      'accusantium',
      'unde',
      'sapiente',
      'voluptate',
      'qui',
      'aspernatur',
      'laudantium',
      'soluta',
      'amet',
      'quo',
      'aliquam',
      'saepe',
      'culpa',
      'libero',
      'ipsa',
      'dicta',
      'reiciendis',
      'nesciunt',
      'doloribus',
      'autem',
      'impedit',
      'minima',
      'maiores',
      'repudiandae',
      'ipsam',
      'obcaecati',
      'ullam',
      'enim',
      'totam',
      'delectus',
      'ducimus',
      'quis',
      'voluptates',
      'dolores',
      'molestiae',
      'harum',
      'dolorem',
      'quia',
      'voluptatem',
      'molestias',
      'magni',
      'distinctio',
      'omnis',
      'illum',
      'dolorum',
      'voluptatum',
      'ea',
      'quas',
      'quam',
      'corporis',
      'quae',
      'blanditiis',
      'atque',
      'deserunt',
      'laboriosam',
      'earum',
      'consequuntur',
      'hic',
      'cupiditate',
      'quibusdam',
      'accusamus',
      'ut',
      'rerum',
      'error',
      'minus',
      'eius',
      'ab',
      'ad',
      'nemo',
      'fugit',
      'officia',
      'at',
      'in',
      'id',
      'quos',
      'reprehenderit',
      'numquam',
      'iste',
      'fugiat',
      'sit',
      'inventore',
      'beatae',
      'repellendus',
      'magnam',
      'recusandae',
      'quod',
      'explicabo',
      'doloremque',
      'aperiam',
      'consequatur',
      'asperiores',
      'commodi',
      'optio',
      'dolor',
      'labore',
      'temporibus',
      'repellat',
      'veniam',
      'architecto',
      'est',
      'esse',
      'mollitia',
      'nulla',
      'a',
      'similique',
      'eos',
      'alias',
      'dolore',
      'tenetur',
      'deleniti',
      'porro',
      'facere',
      'maxime',
      'corrupti'
    ];

    const COMMON_WORDS = [
      'lorem',
      'ipsum',
      'dolor',
      'sit',
      'amet',
      'consectetur',
      'adipisicing',
      'elit',
      'sed',
      'do',
      'eiusmod',
      'tempor',
      'incididunt',
      'ut',
      'labore',
      'et',
      'dolore',
      'magna',
      'aliqua'
    ];

    const words = (count, common = true) => {
      let wordList = common ? COMMON_WORDS : [];
      let c = wordList.length;
      if (count > c) {
        for (let i = 0; i < count; i += 1) {
          wordList.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
        }
      } else {
        wordList = wordList.slice(0, count);
      }

      return wordList.join(' ');
    };

    const sentence = () => {
      const random = Math.floor(Math.random() * 5) + 1;
      const sentence = [];
      for (let i = 0; i < random; i += 1) {
        const words = Math.floor(Math.random() * 12) + 3;
        const start = Math.min(
          Math.floor(Math.random() * WORDS.length),
          WORDS.length - words
        );

        sentence.push(WORDS.slice(start, start + words).join(' '));
      }
      const s = sentence.join(', ');
      return `${s[0].toUpperCase()}${s.substr(1)}${
        Math.random() < 0.5 ? '?' : '.'
      }`;
    };

    const paragraph = () => {
      const random = Math.floor(Math.random() * 4) + 1;
      const paragraph = [];
      for (let i = 0; i < random; i += 1) {
        paragraph.push(sentence());
      }

      return paragraph.join(' ');
    };

    const paragraphs = (count, common = true) => {
      const paras = [];

      for (let i = 0; i < count; i += 1) {
        if (common && i === 0) {
          paras.push(COMMON_P[0]);
        } else {
          paras.push(paragraph());
        }
      }

      return paras;
    };

    return {
        words: words,
        paragraphs: paragraphs,
        paragraph: paragraph,
        sentence: sentence
    }
})();


const JS_ESCAPE = {
    '\\': '\\u005C',
    "'": '\\u0027',
    '"': '\\u0022',
    '>': '\\u003E',
    '<': '\\u003C',
    '&': '\\u0026',
    '=': '\\u003D',
    '-': '\\u002D',
    '`': '\\u0060',
    '\n': '\\u000A',
    '\r': '\\u000D',
    '\t': '\\u0009',
    '\v': '\\u000B',
    '\f': '\\u000C',
    '\b': '\\u0008'
};

// Escape paragraph and line separator
JS_ESCAPE[String.fromCharCode(parseInt(`2028`, 16))] = `\\u2028`;
JS_ESCAPE[String.fromCharCode(parseInt(`2029`, 16))] = `\\u2029`;

// Escape every ASCII character with a value less than 32.
for (let i = 0; i < 32; i += 1) {
    JS_ESCAPE[String.fromCharCode(parseInt(`${i}04X`, 16))] = `\\u${i}04X`;
}

var escapeJs = function(value){
    return markSafe(translateMap(value, JS_ESCAPE));
};


function timesince(input, n, ready) {
    var input = new Date(input)
        , now     = ready === undefined ? new Date() : new Date(n)
        , diff    = input - now
        , since = Math.abs(diff)

    if(diff > 0)
        return '0 minutes'

    // 365.25 * 24 * 60 * 60 * 1000 === years
    var years =     ~~(since / 31557600000)
        , months =    ~~((since - (years*31557600000)) / 2592000000)
        , days =        ~~((since - (years * 31557600000 + months * 2592000000)) / 86400000)
        , hours =     ~~((since - (years * 31557600000 + months * 2592000000 + days * 86400000)) / 3600000)
        , minutes = ~~((since - (years * 31557600000 + months * 2592000000 + days * 86400000 + hours * 3600000)) / 60000)
        , result = [
                years     ? pluralize(years,        'year') : null
            , months    ? pluralize(months,     'month') : null
            , days        ? pluralize(days,         'day') : null
            , hours     ? pluralize(hours,        'hour') : null
            , minutes ? pluralize(minutes,    'minute') : null
        ]
        , out = []

    for(var i = 0, len = result.length; i < len; ++i) {
        result[i] !== null && out.push(result[i])
    }

    if(!out.length) {
        return '0 minutes'
    }

    return out[0] + (out[1] ? ', ' + out[1] : '')

    function pluralize(x, str) {
        return x + ' ' + str + (x === 1 ? '' : 's')
    }
}

var WEEKDAYS = [ _('Sunday'), _('Monday'), _('Tuesday'), _('Wednesday'), _('Thursday'), _('Friday'), _('Saturday') ]
    , WEEKDAYS_ABBR = [_('Sun'), _('Mon'), _('Tue'), _('Wed'), _('Thu'), _('Fri'), _('Sat')]
    , MONTHS = [ _('January'), _('February'), _('March'), _('April'), _('May'), _('June'), _('July'), _('August'), _('September'), _('October'), _('November'), _('December') ]
    , MONTHS_3 = [_('jan'), _('feb'), _('mar'), _('apr'), _('may'), _('jun'), _('jul'), _('aug'), _('sep'), _('oct'), _('nov'), _('dec')]
    // month names in Associated Press style
    , MONTHS_AP = [
         pgettext('abbrev. month', 'Jan.'),
         pgettext('abbrev. month', 'Feb.'),
         pgettext('abbrev. month', 'March'),
         pgettext('abbrev. month', 'April'),
         pgettext('abbrev. month', 'May'),
         pgettext('abbrev. month', 'June'),
         pgettext('abbrev. month', 'July'),
         pgettext('abbrev. month', 'Aug.'),
         pgettext('abbrev. month', 'Sept.'),
         pgettext('abbrev. month', 'Oct.'),
         pgettext('abbrev. month', 'Nov.'),
         pgettext('abbrev. month', 'Dec.')
    ]
    , MONTHS_ALT = [
         pgettext('alt. month', 'January'),
         pgettext('alt. month', 'February'),
         pgettext('alt. month', 'March'),
         pgettext('alt. month', 'April'),
         pgettext('alt. month', 'May'),
         pgettext('alt. month', 'June'),
         pgettext('alt. month', 'July'),
         pgettext('alt. month', 'August'),
         pgettext('alt. month', 'September'),
         pgettext('alt. month', 'October'),
         pgettext('alt. month', 'November'),
         pgettext('alt. month', 'December')];


function Formatter(t) {
    this.data = t
}

Formatter.prototype.format = function(str) {
    var bits = strtoarray(str)
    , esc = false
    , out = []
    , bit

    while(bits.length) {
        bit = bits.shift()

        if(esc) {
            out.push(bit)
            esc = false
        } else if(bit === '\\') {
            esc = true
        } else if(this[bit] && typeof this[bit] === 'function') {
            out.push(this[bit]())
        } else {
            out.push(bit)
        }
    }

    return out.join('')
}

var TimeFormat = function(t) {
    TimeFormat.baseConstructor.call(this, t);
}

inherits(TimeFormat, Formatter);


TimeFormat.prototype.a = function() {
    // 'a.m.' or 'p.m.'
    return this.data.getHours() < 12 ? 'am' : 'pm';
}

TimeFormat.prototype.A = function() {
    // 'AM' or 'PM'
    return this.data.getHours() < 12 ? 'AM' : 'PM';
}

TimeFormat.prototype.f = function() {
    /*
    Time, in 12-hour hours and minutes, with minutes left off if they're
    zero.
    Examples: '1', '1:30', '2:05', '2'
    Proprietary extension.
    */
    if (this.data.getMinutes() == 0)
        return this.g()
    return this.g() + ":" + this.i()
}

TimeFormat.prototype.g = function() {
    // Hour, 12-hour format without leading zeros i.e. '1' to '12'
    var h = this.data.getHours()

    return h === 0 ? 12 : (h > 12 ? h - 12 : h);
}

TimeFormat.prototype.G = function() {
    // Hour, 24-hour format without leading zeros i.e. '0' to '23'
    return this.data.getHours()
}

TimeFormat.prototype.h = function() {
    // Hour, 12-hour format i.e. '01' to '12'
    var format12Hours = this.g();

    return (format12Hours < 10 ? '0' : '') + format12Hours;
}

TimeFormat.prototype.H = function() {
    var hours = this.data.getHours();
    // Hour, 24-hour format i.e. '00' to '23'
    return (hours < 10 ? '0' : '') + hours;
}

TimeFormat.prototype.i = function() {
    // Minutes i.e. '00' to '59'

    var minutes = this.data.getMinutes();
    return (minutes < 10 ? '0' : '') + minutes;
}

TimeFormat.prototype.P = function() {
    /*
    Time, in 12-hour hours, minutes and 'a.m.'/'p.m.', with minutes left off
    if they're zero and the strings 'midnight' and 'noon' if appropriate.
    Examples: '1 a.m.', '1:30 p.m.', 'midnight', 'noon', '12:30 p.m.'
    Proprietary extension.
    */
    var m = this.data.getMinutes()
        , h = this.data.getHours()

    if (m == 0 && h == 0)
        return 'midnight'
    if (m == 0 && h == 12)
        return 'noon'
    return this.f() + " " + this.a()
}

TimeFormat.prototype.s = function() {
    // Seconds i.e. '00' to '59'
    var seconds = this.data.getSeconds();

    return (seconds < 10 ? '0' : '') + seconds;
}

TimeFormat.prototype.u = function() {
    // Microseconds
    // this.data.getTime() / 1000;
    return this.data.getMilliseconds()
}

// DateFormat

var DateTimeFormat = function(t) {
    this.year_days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    DateTimeFormat.baseConstructor.call(this, t);
}

inherits(DateTimeFormat, TimeFormat);


DateTimeFormat.prototype.b = function() {
    // Month, textual, 3 letters, lowercase e.g. 'jan'
    return MONTHS_3[this.data.getMonth()]
}

DateTimeFormat.prototype.c = function() {
    /*
    ISO 8601 Format
    Example : '2008-01-02T10:30:00.000123'
    */
    return this.data.toISOString ? this.data.toISOString() : ''
}

DateTimeFormat.prototype.d = function() {
    // Day of the month, 2 digits with leading zeros i.e. '01' to '31'
    var dayOfTheMonth = this.data.getDate();
    return (dayOfTheMonth < 10 ? '0' : '') + dayOfTheMonth;
}

DateTimeFormat.prototype.D = function() {
    // Day of the week, textual, 3 letters e.g. 'Fri'
    return WEEKDAYS_ABBR[this.data.getDay()]
}

DateTimeFormat.prototype.E = function() {
    // Alternative month names as required by some locales. Proprietary extension.
    return MONTHS_ALT[this.data.getMonth()]
}

DateTimeFormat.prototype.F= function() {
    // Month, textual, long e.g. 'January'
    return MONTHS[this.data.getMonth()]
}

DateTimeFormat.prototype.I = function() {
    // '1' if Daylight Savings Time, '0' otherwise.
    return this.data.isDST() ? '1' : '0'
}

DateTimeFormat.prototype.j = function() {
    // Day of the month without leading zeros i.e. '1' to '31'
    return this.data.getDate()
}

DateTimeFormat.prototype.l = function() {
    // Day of the week, textual, long e.g. 'Friday'
    return WEEKDAYS[this.data.getDay()]
}

DateTimeFormat.prototype.L = function() {
    // Boolean for whether it is a leap year i.e. True or False
    // Selects this year's February 29th and checks if the month
    // is still February.
    return (new Date(this.data.getFullYear(), 1, 29).getMonth()) === 1
}

DateTimeFormat.prototype.m = function() {
    // Month i.e. '01' to '12'"
    return ('0'+(this.data.getMonth()+1)).slice(-2)
}

DateTimeFormat.prototype.M = function() {
    // Month, textual, 3 letters e.g. 'Jan'
    return capfirst(MONTHS_3[this.data.getMonth()])
}

DateTimeFormat.prototype.n = function() {
    // Month without leading zeros i.e. '1' to '12'
    return this.data.getMonth() + 1
}

DateTimeFormat.prototype.N = function() {
    // Month abbreviation in Associated Press style. Proprietary extension.
    return MONTHS_AP[this.data.getMonth()]
}

DateTimeFormat.prototype.O = function() {
    // Difference to Greenwich time in hours e.g. '+0200'

    var tzoffs = this.data.getTimezoneOffset()
        , offs = ~~(tzoffs / 60)
        , mins = ('00' + ~~Math.abs(tzoffs % 60)).slice(-2)
    
    return ((tzoffs > 0) ? '-' : '+') + ('00' + Math.abs(offs)).slice(-2) + mins
}

DateTimeFormat.prototype.r = function() {
    // RFC 2822 formatted date e.g. 'Thu, 21 Dec 2000 16:01:07 +0200'
    return this.format('D, j M Y H:i:s O')
}

DateTimeFormat.prototype.S = function() {
    /* English ordinal suffix for the day of the month, 2 characters i.e. 'st', 'nd', 'rd' or 'th' */
    var d = this.data.getDate()

    if (d >= 11 && d <= 13)
        return 'th'
    var last = d % 10

    if (last == 1)
        return 'st'
    if (last == 2)
        return 'nd'
    if (last == 3)
        return 'rd'
    return 'th'
}

DateTimeFormat.prototype.t = function() {
    // Number of days in the given month i.e. '28' to '31'
    // Use a javascript trick to determine the days in a month
    return 32 - new Date(this.data.getFullYear(), this.data.getMonth(), 32).getDate()
}

DateTimeFormat.prototype.T = function() {
    // Time zone of this machine e.g. 'EST' or 'MDT'
    if(this.data.tzinfo) {
        return this.data.tzinfo().abbr || '???'
    }
    return '???'
}

DateTimeFormat.prototype.U = function() {
    // Seconds since the Unix epoch (January 1 1970 00:00:00 GMT)
    // UTC() return milliseconds frmo the epoch
    // return Math.round(this.data.UTC() * 1000)
    return ~~(this.data / 1000)
}

DateTimeFormat.prototype.w = function() {
    // Day of the week, numeric, i.e. '0' (Sunday) to '6' (Saturday)
    // TODO: Revisar this.data.getDay() -1
    return this.data.getDay()
}

DateTimeFormat.prototype.W = function() {
    // ISO-8601 week number of year, weeks starting on Monday
    // Algorithm from http://www.personal.ecu.edu/mccartyr/ISOwdALG.txt
    var jan1_weekday = new Date(this.data.getFullYear(), 0, 1).getDay() 
        , weekday = this.data.getDay()
        , day_of_year = this.z()
        , week_number
        , i = 365

    if(day_of_year <= (8 - jan1_weekday) && jan1_weekday > 4) {
        if(jan1_weekday === 5 || (jan1_weekday === 6 && this.L.call({data:new Date(this.data.getFullYear()-1, 0, 1)}))) {
            week_number = 53
        } else {
            week_number = 52
        }
    } else {
        if(this.L()) {
            i = 366
        }
        if((i - day_of_year) < (4 - weekday)) {
            week_number = 1
        } else {
            week_number = ~~((day_of_year + (7 - weekday) + (jan1_weekday - 1)) / 7)
            if(jan1_weekday > 4)
                week_number -= 1
        }
    }
    return week_number
}

DateTimeFormat.prototype.y = function() {
    // Year, 2 digits e.g. '99'
    return (''+this.data.getFullYear()).substr(2)
}

DateTimeFormat.prototype.Y = function() {
    // Year, 4 digits e.g. '1999'
    return this.data.getFullYear()
}

DateTimeFormat.prototype.z = function() {
    // Day of the year i.e. '0' to '365'

    doy = this.year_days[this.data.getMonth()] + this.data.getDate()
    if (this.L() && this.data.getMonth() > 1)
        doy += 1
    return doy
}

DateTimeFormat.prototype.Z = function() {
    /*
    Time zone offset in seconds (i.e. '-43200' to '43200'). The offset for
    timezones west of UTC is always negative, and for those east of UTC is
    always positive.
    */
    // return this.data.getTimezoneOffset() * 60;
    return this.data.getTimezoneOffset() * -60
}

function date_time_format(value, format_string) {
    var df = new DateTimeFormat(value);
    return df.format(format_string);
}

function time_format(value, format_string) {
    var tf = new TimeFormat(value);
    return tf.format(format_string);
}

var isDigitRe = /^\d+$/;
var parseDateValue = function(value){
    var d;
    
    if(value instanceof Date) {
        return value;
    } else if (isString(value)){
        if (isDigitRe.test(value)){
            value = parseInt(value);
            d = new Date(value);
        } else {
            d = new Date(value);
            if (isNaN(d.valueOf())) return null;
        }
    } else if(isNumber(value)){
        d = new Date(value);
    } else if(isArray(value)){
        if (value.length === 0){
            d = new Date();
        } else if (value.length === 1){
            d = new Date(value[0]);
        } else if (value.length === 2){
            d = new Date(value[0], value[1]);
        } else if (value.length === 3){
            d = new Date(value[0], value[1], value[2]);
        } else if (value.length === 4){
            d = new Date(value[0], value[1], value[2], value[3]);
        } else if (value.length === 5){
            d = new Date(value[0], value[1], value[2], value[3], value[4]);
        } else if (value.length === 6){
            d = new Date(value[0], value[1], value[2], value[3], value[4], value[5]);
        } else if (value.length === 7){
            d = new Date(value[0], value[1], value[2], value[3], value[4], value[5], value[6]);
        } else {
            return null;
        }
    } else if(isObject(value)){
        var year = value.year || 0;
        var monthIndex = value.monthIndex || 0;
        var day = value.day || 1;
        var hours = value.hours || 0;
        var minutes = value.minutes || 0;
        var seconds = value.seconds || 0;
        var milliseconds = value.milliseconds || 0;

        d = new Date(year, monthIndex, day, hours, minutes, seconds, milliseconds);
    } else {
        return null;
    }
    
    return d;
}

var floatformat = function(number, arg){
    if (arg === 0)
        return number;
    
    var sign = Math.sign(arg);
    var precision = Math.abs(arg);

    number = number.toFixed(precision);

    // Parse string with exponential support.
    if (global.fromExponential !== undefined){
        var numAsString = global.fromExponential(value);
    } else {
        var numAsString = number.toString();
    }

    var numAsStringParts = numAsString.split('.');
    numAsStringParts[1] = numAsStringParts[1].replace(/0+$/, '');

    var remainding = (numAsStringParts[1] && numAsStringParts[1].length) || 0;

    if (sign === -1 && !numAsStringParts[1]) {
        // If a negative arg, and the mantissa is all 0s, drop it.
        return numAsStringParts[0];
    }    
    // If a positive arg, add trailing 0s until we reach the arg count.
    for (let i = remainding; i < precision; i += 1) {
        numAsStringParts[1] += '0';
    }

    var result = numAsStringParts.join('.');

    return result;
}


function get_text_list(list, last_word){  
    /*
    >>> get_text_list(['a', 'b', 'c', 'd'])
    'a, b, c or d'
    >>> get_text_list(['a', 'b', 'c'], 'and')
    'a, b and c'
    >>> get_text_list(['a', 'b'], 'and')
    'a and b'
    >>> get_text_list(['a'])
    'a'
    >>> get_text_list([])
    ''
    */

    last_word = last_word || 'or';

    if (list.length === 0)
        return '';
    if (list.length === 1)
        return list_[0] + '';

    return list.slice(0, -1).join(', ') + ' ' + last_word + ' ' + list[list.length -1];
}


function safely(fn) {
  return function(context) {
    try {
        return fn.call(this, context)
    } catch(err) {
        console.error(err); 
        return '';
    }
  }
}

function escapeHtml(str) {
  return str
    .replace(/\&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

var escapeHtmlRe = /[&"'<>]/g;
var escapeMap = {
    '&': '&amp;',
    '"': '&quot;',
    '\'': '&#39;',
    '<': '&lt;',
    '>': '&gt;'
};

function escapeHtml2(val) {
    return val.replace(escapeHtmlRe, function(s){return escapeMap[s]});
}

// TODO: To choose escape regex function

var matchOperatorsRe = /[|\\{}()\[\]^$+*?\.]/g;
var escapeRegString = function (str) {
  if (typeof str !== 'string') {
    throw new TypeError('Expected a string');
  }

  return str.replace(matchOperatorsRe, '\\$&');
};


var SPECIAL_REGEX_CHARS = '\\.{}[]().+*-?:^$|';
var SPECIAL_REGEX_CHARS_RE = new RegExp("([" + SPECIAL_REGEX_CHARS.replace(/(.)/g, '\\$1') + "])", "g");

var escapeRe = function(str){
    return str.replace(SPECIAL_REGEX_CHARS_RE, '\\$1');
}

var countRePattern = function(str, rePattern) {
    var m = str.match(new RegExp(rePattern, "g"))

    if (m === null){
        return 0
    } else {
        return m.length;
    }
}

var countNewLines = function(str){
    return countRePattern(str, '\\n')
}


// Expression to match some_token and some_token="with spaces" (and similarly for single-quoted strings).
var smart_split_re = new RegExp(multilineFuncString(function(){/**
    ((?:
        [^\s'"]*
        (?:
            (?:"(?:[^"\\]|\\.)*" | '(?:[^'\\]|\\.)*')
            [^\s'"]*
        )+
    ) | \S+)
*/}).replaceAll(/\s+/g, ""), "g");

function smart_split(text){
    /* Function that splits a string by spaces, leaving quoted phrases together.
    Supports both single and double quotes, and supports escaping quotes with
    backslashes. In the output, strings will keep their initial and trailing
    quote marks and escaped quotes will remain escaped (the results can then
    be further processed with unescape_string_literal()).

    >>> smart_split('This is "a person\\\'s" test.')
    Array(4) [ "This", "is", "\"a person\\'s\"", "test." ]
    >>> smart_split("Another 'person\\'s' test.")
    Array(3) [ "Another", "'person\\'s'", "test." ]
    >>> smart_split('A "\\"funky\\" style" test.')
    Array(3) [ "A", "\"\\\"funky\\\" style\"", "test." ]
    */
    return text.match(smart_split_re);
}

function is_string_literal(s){
    if ((s[0] !== '"' && s[0] !== "'") || s[s.length-1] !== s[0]) {
        return false;
    } else {
        return true;
    }
}

/*
 * Return true if value is a string and contains quotes at the beginning and the end.
 */
function is_literal_string_value(value) {
  if ((typeof(value) === 'string' && (value.length >= 3)) &&
     ((value[0] == '"' && value[value.length - 1] == '"') || (value[0] == '\'' && value[value.length - 1] == '\''))) {
    return true;
  }

  return false;
}

function unescape_string_literal(s){
    /*
    Convert quoted string literals to unquoted strings with escaped quotes and
    backslashes unquoted::

        >>> unescape_string_literal('"abc"')
        'abc'
        >>> unescape_string_literal("'abc'")
        'abc'
        >>> unescape_string_literal('"a \"bc\""')
        'a "bc"'
        >>> unescape_string_literal("'\'ab\' c'")
        "'ab' c"
    */
    var quote = s[0];
    return s.substring(1, s.length-1).replaceAll('\\' + quote, quote).replaceAll('\\', '\\');
}



/*
 * Remove quotes from the beginning and end of a string.
 */
function strip_quotes_from_literal_string_value(value) {
  return value.substring(1, value.length - 1);
}


function escape(str){
    return str.replace(/\\/g, '\\\\').replace(/["']/g, function(str){
      return "\\" + str;
    }).replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}


function matchAll(s, regex, fn) {
    if (!regex.global)
        throw "Regex pattern is not global: " + regex.source;

    var m;

    while ((m = regex.exec(s))) {
      fn(m);
    }
}

var wrap = function(text, width){
    /*
    A word-wrap function that preserves existing line breaks. Expects that
    existing line breaks are posix newlines.

    Preserve all white space except added line breaks consume the space on
    which they break the line.

    Don't wrap long words, thus the output text may have lines longer than
    ``width``.
    */

    var lines = [], line, space;
    var splittedLines = text.split(/\n/);

    splittedLines.forEach(function(line){
        while (line.length > width){
            space = line.substring(0, width + 1).lastIndexOf(" ") + 1;

            if (space === 0){
                space = line.indexOf(" ") + 1
                if (space === 0){
                    lines.push(line);
                    line = null
                    break
                }
            }
            lines.push(line.substring(0, space - 1));
            
            line = line.substring(space)
        }
        
        if (line !== null){
            lines.push(line)
        }
    });

    return lines.join("\n");
}


class Truncator {
  wordRegex = /<.*?>|((?:\w[-\w]*|&.*?;)+)/g;
  charRegex = /<.*?>|(.)/g;
  tagRegex = /<(\/)?(\S+?)(?:(\s*\/)|\s.*?)?>/;


  constructor(text) {
    this.text = text;
  }

  addTruncationText(text, truncate = null) {
    if (truncate === null) {
      return `${text}...`;
    }

    if (text.endsWith(truncate)) {
      return text;
    }

    return `${text}${truncate}`;
  }

  chars(num, html = false, truncate = null) {
    const length = parseInt(num, 10);
    // TODO: investigar import normalize from 'normalize-strings';
    // const text = normalize(this.text);
    const text = this.text;
    let truncateLen = length;
    for (let char in this.addTruncationText('', truncate).split('')) {
      truncateLen -= 1;
      if (truncateLen === 0) {
        break;
      }
    }
    if (html) {
      return this.truncateHtml(length, truncate, text, truncateLen, false);
    }
    return this.textChars(length, truncate, text, truncateLen);
  }

  words(num, truncate = null, html = false) {
    const length = parseInt(num, 10);

    if (html) {
      return this.truncateHtml(length, truncate, this.text, length, true);
    }

    return this.textWords(length, truncate);
  }

  textChars(length, truncate, text, truncateLen) {
    let sLen = 0;
    let endIndex = null;

    for (let i in text.split('')) {
      sLen += 1;
      if (endIndex === null && sLen > truncateLen) {
        endIndex = i;
      }
      if (sLen > length) {
        return this.addTruncationText(text.slice(0, endIndex), truncate);
      }
    }

    return text;
  }

  textWords(length, truncate) {
    let words = this.text.split(' ');

    if (words.length > length) {
      words = words.slice(0, length);
      return this.addTruncationText(words.join(' '), truncate);
    }

    return words.join(' ');
  }

  truncateHtml(length, truncate, text, truncateLen, words) {
    if (words && length <= 0) {
      return '';
    }

    const htmlSinglets = [
      'br',
      'col',
      'link',
      'base',
      'img',
      'param',
      'area',
      'hr',
      'input'
    ];

    let endTextPos = 0;
    let currentLen = 0;
    let openTags = [];

    const regex = words ? this.wordRegex : this.charRegex;
    // Reset global regex
    regex.lastIndex = 0;
    while (currentLen <= length) {
      const m = regex.exec(text);
      if (!m) {
        break;
      }
      // If group match collect character/word
      if (m[1]) {
        currentLen += 1;
        if (currentLen === truncateLen) {
          endTextPos = m.index + m[1].length;
        }
        continue;
      }

      // Check if match is actually a tag
      const tag = this.tagRegex.exec(m[0]);
      if (!tag || currentLen >= truncateLen) {
        continue;
      }

      const closingTag = tag[1];
      const tagname = tag[2].toLowerCase();
      const selfClosing = tag[3];

      if (selfClosing || htmlSinglets.includes(tagname)) {
        // pass
      } else if (closingTag) {
        const i = openTags.indexOf(tagname);
        openTags = openTags.slice(i + 1, openTags.length);
      } else {
        openTags.unshift(tagname);
      }
    }

    if (currentLen <= length) {
      return text;
    }

    let out = text.slice(0, endTextPos);
    let truncate_text = this.addTruncationText('', truncate);
    if (truncate_text) {
      out += truncate_text;
    }

    for (let tag in openTags) {
      out += `</${openTags[tag]}>`;
    }

    return out;
  }
}

// SafeString

// A SafeString object indicates that the string should not be
// autoescaped. This happens magically because autoescaping only
// occurs on primitive string objects.
var SafeString = function(s){
    /*
    A str subclass that has been specifically marked as "safe" for HTML output
    purposes.
    */
    this.s = s + '';
    this.length = this.s.length;
}

SafeString.prototype = Object.create(String.prototype, {
    length: {
        writable: true,
        configurable: true,
        value: 0
    }
});

SafeString.prototype.add = function(rhs){
    if (rhs instanceof SafeString){
        this.s = this.s + rhs.toString();
    } else {
        rhs = rhs + "";
        this.s = this.s + rhs;
    }

    this.length = this.s.length
}

SafeString.prototype.toString = function(){
    return this.s;
}

SafeString.prototype.valueOf = function() {
     return this.s;
};

SafeString.prototype.__html__ = function(){
    /*
        Return the html representation of a string for interoperability.
        This allows other template engines to understand SafeString.
    */
    return this.toString();
}

function markSafe(s){
    /*
    Explicitly mark a string as safe for (HTML) output purposes. The returned
    object can be used everywhere a string is appropriate.

    If used on a method as a decorator, mark the returned data as safe.

    Can be called multiple times on a single string.
    */
    if (s instanceof SafeString){
        return s
    } else if (isString(s)){
        return new SafeString(s)
    } else if (isFunction(s)){
        var wrapped = function(){
            var result = s.apply(this, arguments);
            return markSafe(result);
        }
        return wrapped;
    } else {
        throw "Invalid argument for 'markSafe'";
    }
}


var copySafeness = function(dest, target) {
    if (dest instanceof SafeString) {
        return new SafeString(target);
    }

    return target.toString();
}


function escapeHtmlSafe(text){
    /*
    Return the given text with ampersands, quotes and angle brackets encoded
    for use in HTML.

    Always escape input, even if it's already escaped and marked as such.
    This may result in double-escaping. If this is a concern, use
    conditionalEscape() instead.
    */
    text = text + "";
    return markSafe(escapeHtml(text));
}

// safeToString
var conditionalEscape = function(value){
    /*
    Similar to escapeHtml(), except that it doesn't operate on pre-escaped strings.

    This function relies on the __html__ convention used by SafeString class.
    */
    
    if(value === null || value === undefined)
        return '';

    if (value.__html__ && isFunction(value.__html__ )){
        return value.__html__();
    }

    value = value + '';
    return escapeHtml(value);
}


function cycler(items) {
  var index = -1;

  return {
    current: null,
    reset() {
      index = -1;
      this.current = null;
    },

    next() {
      index++;
      if (index >= items.length) {
        index = 0;
      }

      this.current = items[index];
      return this.current;
    },
  };
}

function errorOnNull(fn, msg) {
  return function() {
    var result = fn.apply(this, arguments)
      , args = arguments;

    if(result === null)
      throw new TemplateError(msg.replace(/\{(\d+?)\}/g, function(a, m) {
        return args[+m];
      }))

    return result;
  }
}

var VARIABLE_DOES_NOT_EXISTS = new Object();

var ContextPopException = function(){}
inherits(ContextPopException, Error);

ContextPopException.prototype.toString = function(){ return "ContextPopException: pop() has been called more times than push()"; }


/** @class 
 * 
 * A Context contains all variables passed to the template 
 * by the view. You normally don't create contexts, but rather
 * pass a simple dict (object) to the template's render method. 
 * The template then creates the context. 
 * 
 * We are not using simple dictes for this task 
 * because we need to push and pop additional contexts onto 
 * the original one. This is done by keeping the original dict
 * in a stack on which we push/pop more context dictes.
 *  
 * @param {dict} original context
 */

// TODO: Use maps instead of dictionaries?
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map

function Dict(dict){
    this._dict = dict;
}

Dict.prototype.get = function(key, otherwise){
    if (hasOwnProperty(this._dict, key)){
        return this._dict[key];
    } else {
        return otherwise;
    }
}

Dict.prototype.set = function(key, value){
    this._dict[key] = value;
}

Dict.prototype.setDefault = function(key, defaultValue){
    if (defaultValue === undefined)
        defaultValue = null;

    if (hasOwnProperty(this._dict, key)){
        return this._dict[key];
    } else {
        this._dict[key] = defaultValue;
        return defaultValue;
    }
}

Dict.prototype.has = function( key ){
    return hasOwnProperty(this._dict, key);
}

Dict.prototype.delete = function(key){
    delete this._dict[key];
}


function BaseContext( dict, deepKeySearch ){
    this.deepKeySearch = deepKeySearch === undefined ? true: deepKeySearch;
    this._resetDicts(dict);
}


BaseContext.prototype._resetDicts = function(value){
    this.dicts = [DJANGO_TEMPLATE_SETTINGS.CONTEXT_BUILTINS];
    if (value !== undefined && value !== null) this.dicts.push(copyDict(value));
}


BaseContext.prototype.copy = function(){
   /**
    * Returns a copy of the context at the moment.
    * Use this when you need to save the current context
    * and you expect it to change later. 
    * 
    * @returns {Object} the context copy
    */

    var c = new this.constructor();

    var dicts = [], dict;
    for (var i =0; i< this.dicts.length; i++){
       dict = copyDict(this.dicts[i]);
       dicts.push(dict);
    }
    c.dicts = dicts;
    return c;
}

BaseContext.prototype.iterateDicts = function( func ){
    for (var i=this.dicts.length -1; i>=0; i--)
        func(this.dicts[i]);
}

// iter, __iterate__, iterate
BaseContext.prototype.forEach = function( func ){
    return Object.entries(this.dicts[this.dicts.length-1]).forEach(function(entry){
        func(entry[0], entry[1]);
    });
}


// withContextDict
BaseContext.prototype.push = function( dict, f ){
   /**
    * Pushes a new context dict on the current context. 
    *  
    * @param {dict} the new context 
    */

    if (dict){
        dict = copyDict(dict);
    } else {
        dict = Object.create(null)
    }

    this.dicts.push(dict);

    if (f){
        var result = f(this);
        this.dicts.pop();

        return result;
    }
}

BaseContext.prototype.pop = function( ){
   /**
    * Pops the last added context dict from the stack  
    *  
    * @returns {dict} what we just popped
    */

    if (this.dicts.length === 1)
        throw new ContextPopException();

    return this.dicts.pop();
}

BaseContext.prototype.set = function(key, value){
   // Set a variable in the current context
   this.dicts[this.dicts.length-1][key] = value;
}

BaseContext.prototype.setDefault = function(key, defaultValue){
    // Set a variable in the current context
    if (typeof defaultValue === "undefined")
        defaultValue = null;

    var dict = this.dicts[this.dicts.length-1];
  
    if (hasOwnProperty(dict, key)){
        return dict[key];
    } else {
        dict[key] = defaultValue;
    }
}

BaseContext.prototype.delete = function(key){
   // Delete a variable from the current context
   delete this.dicts[this.dicts.length-1][key];
}

BaseContext.prototype.setUpward = function(key, value){
    // Set a variable in one of the higher contexts if it exists there, otherwise in the current context.
    var i = this.dicts.length;
    var context = this.dicts[i-1];
    var d;

    while(i--){
        d = this.dicts[i];
        if (hasOwnProperty(d, key)){
            context = d;
            break;
        }

    }

    context[key] = value;
}

// containsKey, hasKey, contains
BaseContext.prototype.has = function( key ){
    if (this.deepKeySearch){
        var dicts = this.dicts;

        for (var i =dicts.length; i>=0; i++) {
            if (hasOwnProperty(dicts[i], key)) return true;
        }

        return false;
    } else {
        return hasOwnProperty(this.dicts[this.dicts.length-1], key);
    }
}


BaseContext.prototype.get = function( key, otherwise ){
    /**
    * Retrieves a variable path from the context. The path is 
    * dot-separated (variable.foo.bar).  
    * In this case the context looks for a key names 'variable'. 
    * After finding it, it looks for its 'foo' property and then 
    * for the 'bar' property of the found property. 
    *   
    * If the variable is not found in the context, returns null. 
    * If the variable is found, but does not have the property,  
    * returns undefined, like usual.
    * 
    * @param {String} the variable path 
    * @returns {Mixed} whatever comes out
    */

    otherwise = otherwise || null;
    
    var pathKey;
    
    if (isArray( key )){
        pathKey = key;
    } else {
        var keyType = typeof key;

        switch(keyType){
            case 'string':
                pathKey = key.split(".");
                break;
            case 'symbol':
                pathKey = [key];
                break;
            default:
                throw new TemplateError('Not valid key type: ' + keyType);
        }
    }

    var topKey = pathKey[0];
    var topElement;

    var found = false;


    if (this.deepKeySearch){
        var i     = this.dicts.length
          , dicts = this.dicts;


        while( i-- ){
            if( hasOwnProperty(dicts[i], topKey) ){
                topElement = dicts[i][topKey];
                found = true;

                break;
            }
        }
    } else {
        var dict = this.dicts[this.dicts.length-1]
        if (hasOwnProperty(dict, topKey)){
            topElement = dict[topKey];
            found = true;
        }
    }

    if (found) {
        return objectGetPath( topElement, pathKey.slice(1) );
    } else {
        return otherwise;
    }
}


BaseContext.prototype.flatten = function(){
    // Return this.stack as one dictionary.

    var flat = {};

    for (var i = 0, stack_size=this.dicts.length; i < stack_size; i++) {
         objectMerge(flat, this.dicts[ i ] );
    }

    return flat;
}

BaseContext.prototype.isEqual = function(other){
    // Compare two contexts by comparing theirs 'dicts' attributes.

    if (!(other instanceof BaseContext)) return false;

    return objectIsEqual(this.flatten(), other.flatten());
}


var Context = function(dict, opts){
    opts = setDefaults(opts, {autoescape: true, use_l10n:null});

    this.autoescape = opts.autoescape;
    this.useL10n = opts.use_l10n;

    this.renderContext = opts.render_context || new RenderContext();
    this.template = opts.template || null;
    this.templateName = opts.template_name || "unknown";

    Context.baseConstructor.call(this, dict);
}

inherits(Context, BaseContext);

Context.prototype.newContext = function(values){
    /*
    Return a new context with the same properties, but with only the
    values given in 'values' stored.
    */

    var c = new this.constructor(values, {
        autoescape: this.autoescape,
        use_l10n: this.useL10n,
        template: this.template,
        template_name: this.templateName,
        renderContext: this.renderContext.copy()
    });

    return c;
}

Context.prototype.bindTemplate = function(template, fn){
    if (this.template !== null)
        throw new TemplateError("Context is already bound to a template");

    this.template = template;
    var result = fn(this);

    this.template = null;

    return result;
}

Context.prototype.copy = function(){
    // TODO: Copy also other optional paramemters???
    var duplicate = this.__super__.copy.call(this);
    duplicate.renderContext = this.renderContext.copy();
    return duplicate;
}

Context.prototype.update = function(otherDict){
    // Push otherDict to the stack of dictionaries in the Context
    if (otherDict instanceof BaseContext) {
        if (otherDict.dicts.length === 1)
            throw new TemplateError("Context used to update has length 1");
        otherDict = otherDict.dicts[otherDict.dicts.length -1];
    }
    
    otherDict = copyDict(otherDict);

    this.dicts.push(otherDict);
}


var RenderContext = function(dict){
    /*
    A stack container for storing Template state.

    RenderContext simplifies the implementation of template Nodes by providing a
    safe place to store state between invocations of a node's `render` method.

    The RenderContext also provides scoping rules that are more sensible for
    'template local' variables. The render context stack is pushed before each
    template is rendered, creating a fresh scope with nothing in it. Name
    resolution fails if a variable is not found at the top of the RequestContext
    stack. Thus, variables are local to a specific template and don't affect the
    rendering of other templates as they would if they were stored in the normal
    template context.
    */

    this.template = null;
    RenderContext.baseConstructor.call(this, dict, false);
}


inherits(RenderContext, BaseContext);


RenderContext.prototype.pushState = function(template, fn, isolated_context){
    if (isolated_context === undefined) isolated_context = true;

    initial = this.template;
    this.template = template;

    if (isolated_context)
        this.push();

    var result = fn(this);

    this.template = initial;

    if (isolated_context)
        this.pop();

    return result;
}


var TemplateEngine = function(templateSources, options){
    var options = setDefaults(options, {
        'autoescape': DJANGO_TEMPLATE_SETTINGS.AUTOESCAPE,
        'debug': DJANGO_TEMPLATE_SETTINGS.DEBUG,
        'libraries': DJANGO_TEMPLATE_SETTINGS.LIBRARIES,
        'use_tz': DJANGO_TEMPLATE_SETTINGS.USE_TZ,
        'string_if_invalid': DJANGO_TEMPLATE_SETTINGS.STRING_IF_INVALID
    });

    if (options.libraries){
        Object.entries(options.libraries).forEach(function(entry){
            var libraryName = entry[0];
            var library = entry[1];
            
            if (!(library instanceof Library))
                throw new TemplateError('Library "' + libraryName + '" is not of instance Library');
        });
    }
    
    this.stringIfInvalid = options.string_if_invalid;
    this.autoescape = options.autoescape;
    this.debug = options.debug;
    this.templateLibraries = options.libraries || {};
    this.templateBuiltins = [defaultTemplateLibrary];

    this.templates = {};

    this.templateSources = templateSources || {};
}

TemplateEngine.renderTemplate = function(templateCode, context, options, otherTemplateSources){
    var engine = new TemplateEngine(otherTemplateSources, options);
    return engine.renderTemplateString(templateCode, context)
}

TemplateEngine.addToContextBuiltins = function( dict ){
    /**
    * Pushes a dict to the default context stack. 
    * Every context instance will the dictes pushed to the default. 
    *  
    * @param {Object} The dict to be pushed 
    */
    objectMerge( DJANGO_TEMPLATE_SETTINGS.CONTEXT_BUILTINS, dict );
}

TemplateEngine.createTemplateLibrary = function(){
    return new Library();
}

TemplateEngine.prototype.createLibrary = function(name){
    if (this.templateLibraries[name] !== undefined)
        throw new Error("Library name already registered: " + name);
    
    var library = new Library();
    this.templateLibraries[name] = library;
    
    return library;
}

TemplateEngine.prototype.addLibrary = function(name, library){
    if (this.templateLibraries[name] !== undefined)
        throw new Error("Library name already registered: " + name);
    
    if (!(library instanceof Library)){
        throw new Error("'library' is not of instance Library");        
    }
    
    this.templateLibraries[name] = library;    
}

TemplateEngine.prototype.getTemplateFromString = function(templateCode){
    /*
    Return a compiled Template object for the given template code,
    handling template inheritance recursively.
    */
    return new Template(templateCode, null, this);
}


TemplateEngine.prototype.getTemplate = function(template_name){
    /*
    Return a compiled Template object for the given template name,
    handling template inheritance recursively.
    */
    var template;

    if (this.templates[template_name]){
        template = this.templates[template_name];
    } else {
        if (this.templateSources[template_name]){
            var template = new Template(this.templateSources[template_name], template_name, this);

            this.templates[template_name] = template;
        } else {
            throw new TemplateDoesNotExistError(template_name);
        }
    }

    return template
}

TemplateEngine.prototype.renderTemplateString = function(templateCode, context){
    var t = this.getTemplateFromString(templateCode);

    return t.render(new Context(context)) + ""
}

TemplateEngine.prototype.renderToString = function(template_name, context){
    /*
    Render the template specified by template_name with the given context.
    */
    var t = this.getTemplate(template_name);

    return t.render(new Context(context)) + ""
}

TemplateEngine.Context = Context;


// Globals

var TEXT_TOKEN = 0,
    VAR_TOKEN = 1,
    BLOCK_TOKEN = 2,
    COMMENT_TOKEN = 3;


var TOKEN_TYPE_NAMES = [
    "text",
    "var",
    "block",
    "comment"];


var Token = function(token_type, contents, position, lineno) {
  this.token_type = token_type;
  this.contents = contents;

  this.position = position;
  this.lineno = lineno;
}

Token.prototype.toString = function() {
  // NB: this should only be
  // debug output, so it's
  // probably safe to use
  // JSON.stringify here.
  var tokenName = TOKEN_TYPE_NAMES[this.token_type].toUpperCase();

  return '<' + tokenName + ' token: "' + this.contents.substr(0, 20).replace('\n', '') + '...">';
}

Token.prototype.splitContents = function(){
    var split = [], bit;
    var bits = smart_split(this.contents);

    for (var i = 0; i < bits.length; i++){
        bit = bits[i];

        // Handle translation-marked template pieces
        if (bit.startsWith('_("') || bit.startsWith("_('")){
            var sentinel = bit[2] + ')';
            var trans_bit = [bit];

            while (!bit.endsWith(sentinel)){
                i +=1;
                bit = bits[i];
                trans_bit.push(bit)
            }

            bit = trans_bit.join(' ')
        }
        split.push(bit)
    }

    return split
}


var Lexer = function(templateString){
    this.templateString = templateString;
    this.verbatim = false;
}

Lexer.prototype.tokenize = function(){
    /*
        Return a list of tokens from a given templateString.
    */
    var self = this;

    var in_tag = false;
    var lineno = 1;
    var result = [];

    this.templateString.split(tag_re).forEach(function(bit){
        if (bit !== ""){
            result.push(self.createToken(bit, null, lineno, in_tag));
            lineno += countNewLines(bit);
        }
        in_tag = !in_tag;
    });

    return result
}


Lexer.prototype.createToken = function(token_string, position, lineno, in_tag){
    /*
    Convert the given token string into a new Token object and return it.
    If in_tag is true, we are processing something that matched a tag,
    otherwise it should be treated as a literal string.
    */
    var content;
    
    if (in_tag){
        // The [0:2] and [2:-2] ranges below strip off *_TAG_START and
        // *_TAG_END. The 2's are hard-coded for performance. Using
        // len(BLOCK_TAG_START) would permit BLOCK_TAG_START to be
        // different, but it's not likely that the TAG_START values will
        // change anytime soon.
        var token_start = token_string.substring(0, 2);

        if (token_start === BLOCK_TAG_START){
            content = token_string.substring(2, token_string.length-2).trim();
            if (this.verbatim){
                // Then a verbatim block is being processed.
                if (content !== this.verbatim){
                    return new Token(TEXT_TOKEN, token_string, position, lineno);
                }
                // Otherwise, the current verbatim block is ending.
                this.verbatim = false;
            } else if (["verbatim", "verbatim "].indexOf(content.substring(0,9)) !== -1){
                // Then a verbatim block is starting.
                this.verbatim = "end" + content;
            }
            return new Token(BLOCK_TOKEN, content, position, lineno)
        }
        
        if (!this.verbatim){
            content = token_string.substring(2, token_string.length-2).trim();

            if (token_start === VARIABLE_TAG_START){
                return new Token(VAR_TOKEN, content, position, lineno);
            }
            // BLOCK_TAG_START was handled above.
            if (token_start !== COMMENT_TAG_START) throw new TemplateError("'token_start' is " + token_start +". It must be: " + COMMENT_TAG_START);
            return new Token(COMMENT_TOKEN, content, position, lineno)
        }
    }
    
    return new Token(TEXT_TOKEN, token_string, position, lineno);
}


var DebugLexer = function(){
    DebugLexer.baseConstructor.apply(this, arguments);
}

inherits(DebugLexer, Lexer);

DebugLexer.prototype.tokenize = function(){
    /*
    Split a template string into tokens and annotates each token with its
    start and end position in the source. This is slower than the default
    lexer so only use it when debug is true.
    */
    var self = this;

    var lineno = 1;
    var result = [];
    var upto = 0;

    tag_re.lastIndex = 0;
    matchAll(this.templateString, tag_re, function(m){
        var start = m.index;
        var end = m.index + m[0].length;
        var tagStr = m[0];

        var token_string;

        if (start > upto) {
            token_string = self.templateString.substring(upto, start)
            result.push(self.createToken(token_string, [upto, start], lineno, false))
            lineno += countNewLines(token_string);
            upto = start
        }

        token_string = self.templateString.substring(start, end)
        result.push(self.createToken(token_string, [start, end], lineno, true))
        lineno += countNewLines(token_string);
        upto = end
    });

    var last_bit = this.templateString.substring(upto);
    if (last_bit !== "") {
        result.push(this.createToken(last_bit, [upto, upto + last_bit.length], lineno, false));
    }

    return result
}


var Parser = function(tokens, libraries, builtins){
    var self = this;

    this.tokens = tokens;
    this.tags = {};
    this.filters = {};
    this.commandStack = [];

    if (builtins !== null){
        builtins.forEach(function(builtin){
            self.addLibrary(builtin)
        });
    }

    this.libraries = libraries || {};
}

Parser.prototype.parse = function(parseUntil){
    /*
    Iterate through the parser tokens and compiles each one into a node.

    If parseUntil is provided, parsing will stop once one of the
    specified tokens has been reached. This is formatted as a list of
    tokens, e.g. ['elif', 'else', 'endif']. If no matching token is
    reached, raise an exception with the unclosed block tag details.
    */

    parseUntil = parseUntil || null;

    var nodelist = new NodeList();

    while (this.tokens.length !== 0){
        var token = this.nextToken()
        if (token.token_type === TEXT_TOKEN) {
            this.extendNodelist(nodelist, new TextNode(token.contents), token);
        } else if(token.token_type === VAR_TOKEN){
            if (token.contents === ""){
                throw this.error(token, 'Empty variable tag on line ' + token.lineno);
            }

            try{
                var filter_expression = this.compileFilter(token.contents);
            } catch(e){
                if (e.name === "TemplateSyntaxError") {
                    throw this.error(token, e);
                } else {
                    throw e;
                }
            }

            var varNode = new VariableNode(filter_expression);
            this.extendNodelist(nodelist, varNode, token)
        } else if (token.token_type === BLOCK_TOKEN ){
            var tokenContents = token.contents.trim();

            if (tokenContents === ""){
                throw this.error(token, 'Empty block tag on line ' + token.lineno)
            }

            var command = tokenContents.split(/\s+/)[0];

            if (parseUntil && parseUntil.indexOf(command) !== -1){
                // A matching token has been reached. Return control to
                // the caller. Put the token back on the token list so the
                // caller knows where it terminated.
                this.prependToken(token)
                return nodelist
            }
            // Add the token to the command stack. This is used for error
            // messages if further parsing fails due to an unclosed block tag.

            this.commandStack.push([command, token]);

            // Get the tag callback function from the ones registered with the parser.

            if (this.tags.hasOwnProperty(command)){
                var compile_func = this.tags[command];
            } else {
                this.invalidBlockTag(token, command, parseUntil);
            }
            // Compile the callback into a node object and add it to
            // the node list.
            try{
                var compiled_result = compile_func(this, token)
            } catch(e){
                throw this.error(token, e);
            }

            this.extendNodelist(nodelist, compiled_result, token);
            // Compile success. Remove the token from the command stack.
            this.commandStack.pop();
        }
    }

    if (parseUntil && parseUntil.length !== 0){
        this.unclosedBlockTag(parseUntil)
    }

    return nodelist
}

Parser.prototype.skipPast = function(endtag){
    while (this.tokens.length !== 0){
        var token = this.nextToken();
        if (token.token_type === BLOCK_TOKEN && token.contents === endtag)
            return;
    }

    this.unclosedBlockTag([endtag])
}

Parser.prototype.extendNodelist = function(nodelist, node, token){
    // Check that non-text nodes don't appear before an extends tag.
    if (node.must_be_first && nodelist.contains_nontext){
        throw this.error(
            token, node.toString() + ' must be the first tag in the template.',
        )
    }

    if (!(node instanceof TextNode)){
        nodelist.contains_nontext = true;
    }
    // Set origin and token here since we can't modify the node __init__() method.
    node.token = token
    nodelist.push(node)
}

Parser.prototype.error = function(token, e){
    /*
    Return an exception annotated with the originating token. Since the
    parser can be called recursively, check if a token is already set. This
    ensures the innermost token is highlighted if an exception occurs,
    e.g. a compile error within the body of an if statement.
    */
    if (isString(e)){
        e = new TemplateSyntaxError(e);
    }
    if (! e.hasOwnProperty('token')){
        e.token = token;
    }

    return e;
}

Parser.prototype.invalidBlockTag = function(token, command, parseUntil){
    if (parseUntil && parseUntil.length !== 0){
        throw this.error(
            token,
            "Invalid block tag on line " + token.lineno + ": '" + command + "', expected " + get_text_list(parseUntil.map(function(s){ return "'" + parseUntil + "'";})) + ". Did you forget to register or load this tag?"
        )
    }

    throw this.error(
        token,
        "Invalid block tag on line " + token.lineno + ": '" + command + "'. Did you forget to register or load this tag?"
    )
}

Parser.prototype.unclosedBlockTag = function(parseUntil){
    var commandStackItem = this.commandStack.pop();

    var command = commandStackItem[0];
    var token = commandStackItem[1];

    var msg = "Unclosed tag on line " + token.lineno  + ": '" + command + "'. Looking for one of: " + parseUntil.join(', ') + "."

    throw this.error(token, msg)
}

Parser.prototype.nextToken = function(){
    return this.tokens.shift();
}

Parser.prototype.prependToken = function(token){
    this.tokens.unshift(token);
}

Parser.prototype.deleteFirstToken = function(){
    this.tokens.shift();
}

Parser.prototype.addLibrary = function(lib){
    objectMerge(this.tags, lib.tags);
    objectMerge(this.filters, lib.filters);
}

Parser.prototype.compileFilter = function(token){
    /*
    Convenient wrapper for FilterExpression
    */
    return new FilterExpression(token, this);
}

Parser.prototype.findFilter = function(filterName){
    if (this.filters.hasOwnProperty(filterName)){
        return this.filters[filterName];
    } else {
        throw new TemplateSyntaxError("Invalid filter: '" + filterName + "'");
    }
}


/* This only matches constant *strings* (things in quotes or marked for
 translation). Numbers are treated as variables for implementation reasons
 (so that they retain their type when passed to filters).*/


var strdq = '"[^"\\\\]*(?:\\\\.[^"\\\\]*)*"'; // double-quoted string
var strsq = "'[^'\\\\]*(?:\\\\.[^'\\\\]*)*'"; // single-quoted string
var i18n_open = escapeRe("_(");
var i18n_close = escapeRe(")");

var constant_string = "(?:" + i18n_open + strdq + i18n_close + "|" + i18n_open + strsq + i18n_close + "|" + strdq + "|" + strsq + ")";

var var_chars = '\\w\\.';
var num = '[-+\\.]?\\d[\\d\\.e]*';
var filter_sep = escapeRe(FILTER_SEPARATOR);
var arg_sep = escapeRe(FILTER_ARGUMENT_SEPARATOR);

var filter_raw_string = 
    "^(?<constant>" + constant_string + ")|" + // constant
    "^(?<variable>[" + var_chars + "]+|" + num + ")|" + // variable
      '(?:\\s*' + filter_sep + '\\s*' + 
         '(?<filter_name>\\w+)' + // filter_name
            '(?:' + arg_sep + 
                '(?:' +
                    '(?<constant_arg>' + constant_string +')|' + // constant_arg
                    '(?<var_arg>[' + var_chars + ']+|' + num + ')'+ // variable_arg
                ')' +
            ')?' +
      ')';

var filter_re = new RegExp(filter_raw_string, "g");

var FilterExpression = function(token, parser){
    /*
    Parse a variable token and its optional filters (all as a single string),
    and return a list of tuples of the filter name and arguments.
    Sample::

        >>> token = 'variable|default:"Default value"|date:"Y-m-d"'
        >>> p = Parser('')
        >>> fe = FilterExpression(token, p)
        >>> fe.filters.length
        2
        >>> fe.var
        <Variable: 'variable'>
    */

    this.token = token;

    var var_obj = null;
    var filters = [];
    var upto = 0;

    filter_re.lastIndex = 0;
    
    matchAll(token, filter_re, function(m){
        var start = m.index;
        if (upto != start){
            throw new TemplateSyntaxError("Could not parse some characters: " + token.substring(0, upto) + "|" + token.substring(upto, start) + "|" + token.substring(start));
        }

        if (var_obj === null){
            var variable = m.groups.variable;
            var constant = m.groups.constant;

            if (constant) {
                var_obj = (new Variable(constant)).resolve({});
                if (var_obj === VARIABLE_DOES_NOT_EXISTS){
                    var_obj = null;
                }             
            } else if (variable === undefined) {
                throw new TemplateSyntaxError("Could not find variable at start of " + token + ".");
            } else {
                var_obj = new Variable(variable);
            }
        } else {
            var filter_name = m.groups.filter_name;

            var arg;
            var constant_arg = m.groups.constant_arg;
            var var_arg = m.groups.var_arg;

            var filter_func = parser.findFilter(filter_name);

            var filterParams = [filter_func]

            if (constant_arg) {
                arg = (new Variable(constant_arg)).resolve({});
                filterParams.push([false, arg])
            } else if(var_arg) {
                arg = new Variable(var_arg);
                filterParams.push([true, arg])
            }

            filters.push(filterParams)
        }

        upto = m.index + m[0].length;
    });

    if (upto != token.length){
        throw new TemplateSyntaxError("Could not parse the remainder: '" + token.substring(upto) + "' from '" + token + "'");
    }

    this.filters = filters;
    this.variableObj = var_obj;
}

FilterExpression.prototype.resolve = function(context, opts){
    var obj, new_obj;

    opts = opts || {};
    var ignore_failures = opts.ignore_failures || false;

    if (this.variableObj instanceof Variable){
        obj = this.variableObj.resolve(context);

        if (obj === VARIABLE_DOES_NOT_EXISTS){
            if (ignore_failures){
                obj = null;
            } else {
                if (context.template.engine.debug){
                    console.log("WARNING Variable does not exists: " + this.variableObj.variable);
                }

                var stringIfInvalid = context.template.engine.stringIfInvalid;
                if (stringIfInvalid) {
                    stringIfInvalid = stringIfInvalid.replace("%s", this.variableObj.variable);
                    return stringIfInvalid
                }

                obj = stringIfInvalid;
            }
        }
    } else {
        obj = this.variableObj;
    }

    this.filters.forEach(function(filter){
        var func = filter[0];
        var argDef = filter[1];

        var funcFilterArguments = [obj];

        if (argDef){
            var lookup = argDef[0];
            var arg = argDef[1];

            if (lookup){
                funcFilterArguments.push(arg.resolve(context));
            } else {
                funcFilterArguments.push(markSafe(arg));
            }
        } else {
            funcFilterArguments.push(null);
        }

        var filter_options = func._filter_options;

        if (filter_options && filter_options.needs_autoescape) {
            funcFilterArguments.push(context.autoescape);
        }

        new_obj = func.apply(null, funcFilterArguments);

        if (filter_options && filter_options.is_safe && obj instanceof SafeString){
            obj = markSafe(new_obj);
        } else {
            obj = new_obj;
        }
    });

    return obj;
}

FilterExpression.prototype.toString = function(){
    return this.token;
}


var Variable = function(variable){
    /*
    A template variable, resolvable against a given context. The variable may
    be a hard-coded string (if it begins and ends with single or double quote
    marks)::

        >>> c = {'article': {'section':'News'}}
        >>> Variable('article.section').resolve(c)
        'News'
        >>> Variable('article').resolve(c)
        {'section': 'News'}
        >>> class AClass: pass
        >>> c = AClass()
        >>> c.article = AClass()
        >>> c.article.section = 'News'

    (The example assumes VARIABLE_ATTRIBUTE_SEPARATOR is '.')
    */

    this.variable = variable
    this.literal = null
    this.lookups = null
    this.translate = false
    this.messageContext = null

    if (!isString(variable)){
        throw new TemplateError("Variable must be a string or number, got " + typeof variable);
    }
    
    var num = parseFloat(variable);

    if (isNaN(num)){
        // A NaN means that the variable isn't a number.
        if (variable.startsWith('_(') && variable.endsWith(')')){
            // The result of the lookup should be translated at rendering time.
            this.translate = true
            variable = variable.substring(2, variable.length-1)
        }

        // If it's wrapped with quotes (single or double), then we're also dealing with a literal.

        if (is_string_literal(variable)){
            this.literal = markSafe(unescape_string_literal(variable))
        } else {
            // Otherwise we'll set this.lookups so that resolve() knows we're dealing with a bonafide variable
            if (variable.indexOf(VARIABLE_ATTRIBUTE_SEPARATOR + '_') !== -1 || variable[0] == '_'){
                throw new TemplateSyntaxError("Variables and attributes may not begin with underscores: '" + variable +"'");
            }
            this.lookups = variable.split(VARIABLE_ATTRIBUTE_SEPARATOR);
        }
    } else {
        this.literal = num;
    }
}

Variable.prototype.resolve = function(context){
    // Resolve this variable against a given context.
    var value;

    if (this.lookups !== null) {
        // We're dealing with a variable that needs to be resolved
        value = this._resolveLookup(context);
    } else {
        // We're dealing with a literal,l` so it's already been "resolved"
        value = this.literal;
    }

    if (this.translate){
        var msgid = value.replace('%', '%%');

        if (this.messageContext){
            return gettext(msgid, this.messageContext);
        } else {
            return gettext(msgid);
        }
    }

    return value;
}


Variable.prototype.toString = function(){
    return "<Variable: " + this.variable + ">";
}

Variable.prototype._resolveLookup = function(context){
    /*
    Perform resolution of a real variable (i.e. not a literal) against the
    given context.

    As indicated by the method's name, this method is an implementation
    detail and shouldn't be called by external code. Use Variable.resolve()
    instead.
    */

    if (context instanceof BaseContext){
        return context.get(this.lookups, VARIABLE_DOES_NOT_EXISTS);
    } else {
        return objectGetPath(context, this.lookups)
    }
}


var _NODE_ID = 0;

var Node = function(){
    this._id = _NODE_ID++;
    this._nodeKey = Symbol(this._id);
};

Node.prototype.toString = function(){
    return "<"+ this.constructor.name + " #" + this._id + ">";
};

// Set this to true for nodes that must be first in the template (although they can be preceded by text nodes.
Node.prototype.must_be_first = false;
Node.prototype.child_nodelists = ['nodelist'];
Node.prototype.token = null;


Node.prototype.render = function(context){
    // Return the node rendered as a string.
}

Node.prototype.renderAnnotated = function(context){
    /*
    Render the node. If debug is true and an exception occurs during
    rendering, the exception is annotated with contextual line information
    where it occurred in the template. For internal usage this method is
    preferred over using the render method directly.
    */
    try{
        return this.render(context);
    }catch(e){
        if (context.template.engine.debug && !e.template_debug) {
            e.template_debug = context.renderContext.template.getExceptionInfo(e, this.token);
        }
        throw e;
    }

}

Node.prototype.getNodesByType = function(nodetype){
    /*
    Return a list of all nodes (within this node and its nodelist)
    of the given type
    */
    var self = this;

    var nodes = [];
    if (this instanceof nodetype){
        nodes.push(this);
    };

    this.child_nodelists.forEach(function(attr){
        var nodelist = self[attr];

        if (nodelist)
            nodes = nodes.concat(nodelist.getNodesByType(nodetype));
    });
    return nodes;
}

var NodeList = function(nodes) {
    this.nodes = nodes || [];
}

// Set to true the first time a non-TextNode is inserted by extendNodelist().
NodeList.prototype.contains_nontext = false;

NodeList.prototype.forEach = function(f) {
    this.nodes.forEach(f);
};

NodeList.prototype.push = function(node) {
    this.nodes.push(node);
}

NodeList.prototype.length = function() {
    return this.nodes.length;
}

NodeList.prototype.render = function(context) {
    var bits = [];

    this.nodes.forEach(function(node){
        var bit;

        if (node instanceof Node){
            bit = node.renderAnnotated(context);
        } else {
            bit = node;
        }
        bits.push(bit + '');
    });

    return markSafe(bits.join(''));
}

NodeList.prototype.getNodesByType = function(nodetype) {
    // Return a list of all nodes of the given type

    var nodes = [];

    this.nodes.forEach(function(node){
        nodes = nodes.concat(node.getNodesByType(nodetype));
    });

    return nodes
}

NodeList.prototype.toString = function(){
    return "[ " + this.nodes.map(function(node){return node.toString()}).join(", ") + " ]"
}

var TextNode = function(s){
    this.s = s
    TextNode.baseConstructor.call(this);
}

inherits(TextNode, Node);

TextNode.prototype.toString = function(){
    return "<TextNode #" + this._id + ": " + this.s.substring(0, 25) + ">";
}

TextNode.prototype.render = function(context){
    return this.s;
}


var render_value_in_context = function(value, context){
    /*
    Convert any value to a string to become part of a rendered template. This
    means escaping, if required, and conversion to a string. If value is a
    string, it's expected to already be translated.
    */

    value = localize(value, context.useL10n)

    if (context.autoescape){
        return conditionalEscape(value);
    } else {
        return value + '';
    }
}


var VariableNode = function(filter_expression){
    this.filter_expression = filter_expression;
    VariableNode.baseConstructor.call(this);
}

inherits(VariableNode, Node);

VariableNode.prototype.toString = function(self){
    return "<Variable Node #" + this._id + ": " + this.filter_expression + ">";
}

VariableNode.prototype.render = function(context){
    var output = this.filter_expression.resolve(context);
    return render_value_in_context(output, context);
}


var tag_re_source = '('  + 
    [
        escapeRe(BLOCK_TAG_START) + '.*?' + escapeRe(BLOCK_TAG_END),
        escapeRe(VARIABLE_TAG_START) + '.*?' + escapeRe(VARIABLE_TAG_END),
        escapeRe(COMMENT_TAG_START) + '.*?' + escapeRe(COMMENT_TAG_END)
    ].join("|") + ")";

// match a variable or block tag and capture the entire tag, including start/end delimiters
var tag_re = new RegExp(tag_re_source, "g");

/**
  err.update = function(path) {
    let msg = '(' + (path || 'unknown path') + ')';

    // only show lineno + colno next to path of template
    // where error occurred
    if (this.firstUpdate) {
      if (this.lineno && this.colno) {
        msg += ` [Line ${this.lineno}, Column ${this.colno}]`;
      } else if (this.lineno) {
        msg += ` [Line ${this.lineno}]`;
      }
    }

    msg += '\n ';
    if (this.firstUpdate) {
      msg += ' ';
    }

    this.message = msg + (this.message || '');
    this.firstUpdate = false;
    return this;
  };
**/

function TemplateError(message) {
    var error = new Error(message);
    var error_name = this.constructor.name;
    
    Object.defineProperty(error, 'name', {
        value: error_name
    });
    
    Object.setPrototypeOf(error, Object.getPrototypeOf(this))
    
    return error;
}

inherits(TemplateError, Error);


// TemplateError.prototype.toString = function(){ return this.name + ": " + this.message; }


var InvalidTemplateLibraryError = function( libraryName ){
    InvalidTemplateLibraryError.baseConstructor.call(this, 'Invalid template library: ' + libraryName);
}
inherits(InvalidTemplateLibraryError, TemplateError);


var TemplateDoesNotExistError = function( template_name ){
    return TemplateDoesNotExistError.baseConstructor.call(this, "Template '" + template_name + "' does not exist");
}

inherits(TemplateDoesNotExistError, TemplateError);

/**
 * Exception that's thrown when invalid markup is encoutered.
 * The exception used for syntax errors during parsing or rendering.
 */

var TemplateSyntaxError = function( message ){
    return TemplateSyntaxError.baseConstructor.call(this, message);
}

inherits(TemplateSyntaxError, TemplateError);


var Template = function(source, name, engine){
    this.name = name || "";
    this.source = source;
    this.engine = engine;

    this.nodelist = this.compileNodelist();
}

// __iter__
Template.prototype.forEach = function(f){
    this.nodelist.forEach(f)
}

Template.prototype._render = function(context){
    return this.nodelist.render(context)
}

Template.prototype.render = function(context){
    // Display stage -- can be called many times
    var self = this;

    return context.renderContext.pushState(this, function(){
        if (context.template === null){
            return context.bindTemplate(self, function(context){
                context.templateName = self.name;
                return self._render(context);
            });
        } else {
            return self._render(context);
        }
    });
}

Template.prototype.compileNodelist = function(){
    /*
        Parse and compile the template source into a nodelist. If debug
        is true and an exception occurs during parsing, the exception is
        is annotated with contextual line information where it occurred in the
        template source.
    */
    var lexer;

    if (this.engine.debug){
        lexer = new DebugLexer(this.source)
    } else {
        lexer = new Lexer(this.source)
    }

    var tokens = lexer.tokenize();
    // self.engine.templateLibraries, self.engine.template_builtins,
    var parser = new Parser(
        tokens, this.engine.templateLibraries, this.engine.templateBuiltins
    );

    try {
        return parser.parse();
    } catch(e){
        if (this.engine.debug && e.token !== undefined){
            e.template_debug = this.getExceptionInfo(e, e.token);
        }
        throw e;
    }
}

Template.prototype.getExceptionInfo = function(exception, token){
    /*
    Return a dictionary containing contextual line information of where
    the exception occurred in the template. The following information is
    provided:

    message
        The message of the exception raised.

    source_lines
        The lines before, after, and including the line the exception
        occurred on.

    line
        The line number the exception occurred on.

    before, during, after
        The line the exception occurred on split into three parts:
        1. The contents before the token that raised the error.
        2. The token that raised the error.
        3. The contents after the token that raised the error.

    total
        The number of lines in source_lines.

    top
        The line number where source_lines starts.

    bottom
        The line number where source_lines ends.

    start
        The start position of the token in the template source.

    end
        The end position of the token in the template source.
    */
    var self = this;

    var start = token.position[0];
    var end = token.position[1];

    var context_lines = 10;
    var line = 0;
    var upto = 0;
    var source_lines = [];
    var before = "";
    var during = "";
    var after = "";


    linebreak_indices(this.source).forEach(function(next, i){
        if (start >= upto && end <= next){
            line = i;
            before = self.source.substring(upto, start);
            during = self.source.substring(start, end);
            after = self.source.substring(end, next);
        }

        source_lines.push((i, self.source.substring(upto, next)));
        upto = next;
    });

    var total = source_lines.length;

    var top = Math.max(1, line - context_lines);
    var bottom = Math.min(total, line + 1 + context_lines);

    var message = exception.message;

    return {
        'message': message,
        'source_lines': source_lines.slice(top, bottom),
        'before': before,
        'during': during,
        'after': after,
        'top': top,
        'bottom': bottom,
        'total': total,
        'line': line,
        'name': this.name,
        'start': start,
        'end': end,
    }
}


function linebreak_indices(template_source){
    var indices = [0];

    var p = template_source.indexOf('\n')
    while (p >= 0){
        indices.push(p + 1);
        p = template_source.indexOf('\n', p + 1)
    }

    indices.push(template_source.length);

    return indices;
}


// Regex for token keyword arguments
var kwarg_re = new RegExp("(?:(\\w+)=)?(.+)");


function token_kwargs(bits, parser, support_legacy){
    /*
    Parse token keyword arguments and return a dictionary of the arguments
    retrieved from the ``bits`` token list.

    `bits` is a list containing the remainder of the token (split by spaces)
    that is to be checked for arguments. Valid arguments are removed from this
    list.

    `support_legacy` - if true, the legacy format ``1 as foo`` is accepted.
    Otherwise, only the standard ``foo=1`` format is allowed.

    There is no requirement for all remaining token ``bits`` to be keyword
    arguments, so return the dictionary as soon as an invalid argument format
    is reached.
    */

    var key, value;

    support_legacy = support_legacy || false;

    if (bits.length === 0)
        return {};

    var m = kwarg_re.exec(bits[0])
    kwarg_format = m && m[1];

    if (!kwarg_format){
        if (!support_legacy)
            return {};
        if (bits.length < 3 || bits[1] !== 'as')
            return {};
    }

    kwargs = {}
    while (bits.length !== 0){
        if (kwarg_format){
            m = kwarg_re.exec(bits[0])
            if (!m || !m[1])
                return kwargs;
            key = m[1];
            value = m[2];

            bits.shift();
        } else {
            if (bits.length < 3 || bits[1] != 'as')
                return kwargs;

            key = bits[2];
            value = bits[0];

            bits.shift();
            bits.shift();
            bits.shift();
        }

        kwargs[key] = parser.compileFilter(value);
        if (bits.length !== 0 && !kwarg_format){
            if (bits[0] !== 'and')
                return kwargs;

            bits.shift();
        }
    }
    return kwargs
}


// Parser and utilities for the smart 'if' tag

// Using a simple top down parser, as described here:
//    http://effbot.org/zone/simple-top-down-parsing.htm.
// 'led' = left denotation
// 'nud' = null denotation
// 'bp' = binding power (left = lbp, right = rbp)

var TokenBase = function(value){
    // Base class for operators and literals, mainly for debugging and for throwing syntax errors.

    this.id = null;  // node/token type name
    this.value = value || null;  // used by literals
    this.first = null;
    this.second = null;  // used by tree nodes
}

TokenBase.prototype.nud = function(parser){
    // Null denotation - called in prefix context
    throw new TemplateError(
        "Not expecting '" + this.id + "' in this position in if tag."
    );
}

TokenBase.prototype.led = function(self, left, parser){
    // Left denotation - called in infix context
    throw new TemplateError(
        "Not expecting '" + this.id + "' as infix operator in if tag."
    )
}

TokenBase.prototype.display = function(){
    // Return what to display in error messages for this node
    return this.id;
}

TokenBase.prototype.toString = function(){
    var out = [];

    if (this.id !== null)
        out.push(this.id);

    if (this.first !== null)
        out.push(this.first);

    if (this.second !== null)
        out.push(this.second);

    return "(" + out.join(" ") + ")"
}


function InfixOperator(bp, cmp) {
  this.lbp = bp
  this.cmp = cmp

  this.first = null;
  this.second = null;
} 


InfixOperator.prototype.led = function(lhs, parser) {
  this.first = lhs;
  this.second = parser.expression(this.lbp);
  return this;
}

InfixOperator.prototype.evaluate = function(context) {
  try {
    return this.cmp(context, this.first, this.second)
  } catch(e){
    // Templates shouldn't throw exceptions when rendering.  We are most likely to get exceptions for things like {% if foo in bar  %} where 'bar' does not support 'in', so default to false
    return false;
  }
}

function PrefixOperator(bp, cmp) {
  this.lbp = bp
  this.cmp = cmp

  this.first = null;
  this.second = null;
}

PrefixOperator.prototype.nud = function(parser) {
  this.first = parser.expression(this.lbp);
  this.second = null;
  return this;
}

PrefixOperator.prototype.evaluate = function(context) {
  try {
    return this.cmp(context, this.first)
  } catch(e){
    // Templates shouldn't throw exceptions when rendering.  We are most likely to get exceptions for things like {% if foo in bar  %} where 'bar' does not support 'in', so default to false
    return false;
  }
}

// Object.keys includes only own, enumerable, string-keyed properties;
// TODO: Maybe remove?
var keys = Object.keys || keyshim;

function keyshim(obj) {
  var accum = []

  for(var n in obj) if(obj.hasOwnProperty(n)) {
    accum.push(n)
  }

  return accum
}


var OPERATORS = {
    'or': function() {
      return new InfixOperator(6, function(context, x, y) {
          return x.evaluate(context) || y.evaluate(context)
      })
    }

  , 'and': function() {
      return new InfixOperator(7, function(context, x, y) {
          return x.evaluate(context) && y.evaluate(context)
      })
    }

  , 'not': function() {
      return new PrefixOperator(8, function(context, x) {
          return !x.evaluate(context)
      })
    }

  , 'in': function() {
        return new InfixOperator(9, function(context, x, y) {
            return in_operator(x.evaluate(context), y.evaluate(context));
        })
    }

  , 'not in': function() {
        return new InfixOperator(9, function(context, x, y) {
            return !in_operator(x.evaluate(context), y.evaluate(context));
        })
    }

  , 'is': function() {
        return new InfixOperator(10, function(context, x, y) {
            return x.evaluate(context) instanceof y.evaluate(context);
        })
  }

  , 'is not': function() {
        return new InfixOperator(10, function(context, x, y) {
            return !(x.evaluate(context) instanceof y.evaluate(context));
        })
  }

  , '===': function() {
      return new InfixOperator(10, function(context, x, y) { 
          return x.evaluate(context) === y.evaluate(context)
      })
    }

  , '!==': function() {
      return new InfixOperator(10, function(context, x, y) { 
          return x.evaluate(context) !== y.evaluate(context)
      })
    }

  , '==': function() {
      return new InfixOperator(10, function(context, x, y) { 
          return x.evaluate(context) == y.evaluate(context)
      })
    }

  , '!=': function() {
        return new InfixOperator(10, function(context, x, y) { 
            return x.evaluate(context) != y.evaluate(context)
        })
    }

  , '>': function() {
        return new InfixOperator(10, function(context, x, y) { 
            return x.evaluate(context) > y.evaluate(context)
        })
    }

  , '>=': function() {
        return new InfixOperator(10, function(context, x, y) { 
            return x.evaluate(context) >= y.evaluate(context)
        })
    }

  , '<': function() {
        return new InfixOperator(10, function(context, x, y) { 
            return x.evaluate(context) < y.evaluate(context)
        })
    }

  , '<=': function() {
        return new InfixOperator(10, function(context, x, y) { 
            return x.evaluate(context) <= y.evaluate(context)
        })
    }
}


// Assign 'id' to each:
Object.entries(OPERATORS).forEach(function(entry){
    var key = entry[0];
    var op = entry[1];

    op.id = key;
});


var Literal = function(value) {
    /*
    A basic self-resolvable object similar to a Django template variable.
    
    IfParser uses Literal in createVar, but TemplateIfParser overrides createVar so that a proper implementation that actually resolves variables, filters etc. is used. */
    this.value = value;
}

inherits(Literal, TokenBase);

Literal.prototype.id = "literal";
Literal.prototype.lbp = 0;

Literal.prototype.nud = function(parser) {
    return this
}

Literal.prototype.evaluate = function(context) {
    return this.value;
  /*
  if(!this.value)
    return this.value

  if(!this.value.resolve)
    return this.value

  return this.value.resolve(context)*/
}


var EndToken = function() {
    this.lbp = 0;
}

inherits(EndToken, TokenBase);

EndToken.prototype.nud = function(parser){
    throw new TemplateError("Unexpected end of expression in if tag.")
}


var endToken = new EndToken();


var IfParser = function(tokens) {
  var numTokens = tokens.length
    , i = 0
    , mappedTokens = []
    , token;

  while(i < numTokens) {
    token = tokens[i];
    if (token === "is" && i + 1 < numTokens && tokens[i + 1] === "not"){
        token = "is not";
        i += 1;  // skip 'not'
    } else if(token === 'not' && i + 1 < numTokens && tokens[i+1] === 'in') {
      token = 'not in';
      ++i; // skip 'in'
    }
    mappedTokens.push(this.translateToken(token))
    ++i
  }

  this.pos = 0;
  this.tokens = mappedTokens;
  this.currentToken = this.nextToken();
}

IfParser.prototype.translateToken = function(token) {
    var op = OPERATORS[token]

    if(op === undefined) {
        return this.createVar(token)
    }

    return op()
}

IfParser.prototype.nextToken = function() {
    if(this.pos >= this.tokens.length) {
        return endToken;
    }
    return this.tokens[this.pos++];
}

IfParser.prototype.parse = function() {
    var retval = this.expression()

    // Check that we have exhausted all the tokens
    if(this.currentToken !== endToken) {
        throw new TemplateError("Unused "+ this.currentToken.display() +" at end of if expression.");
    }

    return retval
}

IfParser.prototype.expression = function(rbp) {
    rbp = rbp || 0

    var t = this.currentToken, left;

    this.currentToken = this.nextToken();

    left = t.nud(this);
    while(rbp < this.currentToken.lbp) {
        t = this.currentToken;

        this.currentToken = this.nextToken();

        left = t.led(left, this);
    }

    return left
}

IfParser.prototype.createVar = function(value){
    return new Literal(value);
}


var Library = function() {
    /*
    A class for registering template tags and filters. Compiled filter and
    template tag functions are stored in the filters and tags attributes.
    The filter, simpleTag, and inclusionTag methods provide a convenient
    way to register callables as tags.
    */
    this.filters = {}
    this.tags = {}
}

Library.prototype.tag = function(name, compile_function){
    var self = this;

    name = name || null;
    compile_function = compile_function || null;

    if (name === null && compile_function === null) {
        return this.tagFunction;
    } else if (name !== null && compile_function === null){
        if (isFunction(name)){
            return this.tagFunction(name);
        } else {
            var dec = function(func){
                return self.tag(name, func);
            }
            return dec;
        }
    } else if (name !== null &&  compile_function !== null){
        this.tags[name] = compile_function;
        return compile_function;
    } else {
        throw new TemplateError(
            "Unsupported arguments to Library.tag"
        );
    }
}

Library.prototype.tagFunction = function(func){
    var name = (func._decorated_function || func).name;

    this.tags[name] = func;
    return func;
}


Library.prototype.filter = function(){
    /*
    Register a callable as a template filter. Example:

    function lower(value){
        return value.toLowerCase()
    }
    register.filter(lower)

    */
    var name, filter_func, flags;
    var self = this;
    var numArgs = arguments.length;

    if (numArgs === 0){
        // register_filter = register.filter()
        var dec = function(func, flags){
            return self.filterFunction(func, flags)
        }
        return dec
    } else if (numArgs === 1){
        var arg0 = arguments[0];
        if (isFunction(arg0)){
            // register.filter(somefunc)
            filter_func = arg0;
            return this.filterFunction(filter_func);
        } else {
            throw new TemplateError(
                "If there is only one argument, first argument should be a function"
            )
        }
    } else if (numArgs === 2 && isFunction(arguments[0])){
        // register.filter(somefunc, flags)
        filter_func = arguments[0];
        flags = arguments[1];
        return this.filterFunction(filter_func, flags);
    } else if (numArgs <= 3){
        // register.filter('somename', somefunc)
        // register.filter('somename', somefunc, flags)
        name = arguments[0];
        filter_func = arguments[1];
        flags = arguments[2];

        if (flags){
            filter_func._filter_options = flags;

            // set the flags on the innermost decorated function for decorators that need it, e.g. stringfilter
            if (filter_func._decorated_function){
                filter_func._decorated_function._filter_options = flags;
            }
        }

        filter_func._filter_name = name;

        this.filters[name] = filter_func;
        return filter_func
    } else {
        throw new TemplateError(
            "Unsupported number of arguments to Library.filter"
        )
    }
}

Library.prototype.stringfilter = function(name, filter_func, flags){
    var filter_func = stringfilter(filter_func);
    return this.filter(name, filter_func, flags)
}

Library.prototype.filterFunction = function(func, flags){
    var name = (func._decorated_function || func).name;

    return this.filter(name, func, flags);
}

Library.prototype.simpleTag = function(){
    /*
    Register a callable as a compiled template tag. Example:
    
    register.simpleTag(function hello(){
        return 'world'
    });

    */
    var func, takes_context, name;

    var arguments_length = arguments.length;

    if (arguments_length === 3){
        name = arguments[0];
        func = arguments[1];
        takes_context = arguments[2];
    } else if (arguments_length === 2){
        if (isFunction(arguments[0])){
            func = arguments[0];
            takes_context = arguments[1];
        } else {
            name = arguments[0];
            func = arguments[1];
        }
    } else if (arguments_length === 1){
        func = arguments[0];
    } else {
        throw new TemplateError("Invalid number of arguments to simpleTag.");
    }
    
    if (!isFunction(func)){
        throw new TemplateError("No callback provided to simpleTag.");
    }

    takes_context = takes_context || false;

    var tag_name = name || (func._decorated_function || func).name;

    var compile_func = function(parser, token){
        var bits = token.splitContents().slice(1);
        var target_var = null;

        if (bits.length >= 2 && bits[bits.length-2] == 'as'){
            target_var = bits[bits.length-1];
            bits = bits.slice(0, bits.length-3);
        }

        var parsed_bits = parse_bits(
            parser, bits, tag_name
        );

        return new SimpleNode(func, takes_context, parsed_bits.args, parsed_bits.kwargs, target_var);
    }
    compile_func._decorated_function = func;

    this.tag(tag_name, compile_func);
}

Library.prototype.inclusionTag = function(template_name, func, takes_context, name){
    /*
    Register a callable as an inclusion tag:

    register.inclusionTag('results.html', function show_results(poll){
        var choices = model.poll_choices;
        return {'choices': choices}
    })

    */

    if (!isFunction(func)){
        throw new TemplateError("Second argument to simpleTag should be a function");
    }

    var tag_name = name || (func._decorated_function || func).name;
    takes_context = takes_context || false;

    var compile_func = function(parser, token){
        var bits = token.splitContents().slice(1);
        var parsed_bits = parse_bits(
            parser, bits, tag_name
        )
        return new InclusionNode(
            func, takes_context, parsed_bits.args, parsed_bits.kwargs, template_name
        )
    }

    compile_func._decorated_function = func;

    this.tag(tag_name, compile_func);
}


/*
* STRING DECORATOR
*/
var stringfilter = function(func){
    /*
    Decorator for filters which should only receive strings. The object
    passed as the first positional argument will be converted to a string.
    */
    function _dec(){
        var arg0 = arguments[0];

        if (arg0 === undefined) {
            arg0 = "";
        } else {
            arg0 = arg0 + "";
        }

        var newArguments = [].concat(arg0, Array.prototype.slice.call(arguments, 1));

        if (arguments[0] instanceof SafeString && _dec._decorated_function._filter_options && _dec._decorated_function._filter_options.is_safe){
            return markSafe(func.apply(null, newArguments));
        }
        return func.apply(null, newArguments);
    }

    // Include a reference to the real function (used to check original
    // arguments by the template parser, and to bear the 'is_safe' attribute
    // when multiple decorators are applied).
    _dec._decorated_function = func._decorated_function || func;

    return _dec
}


// defaultLibrary
var defaultTemplateLibrary = new Library();

var TagHelperNode = function(func, takes_context, args, kwargs){
    /*
    Base class for tag helper nodes such as SimpleNode and InclusionNode.
    Manages the positional and keyword arguments to be passed to the decorated
    function.
    */
    this.func = func;
    this.takes_context = takes_context;
    this.args = args || null;
    this.kwargs = kwargs || null;
    TagHelperNode.baseConstructor.call(this);
}

inherits(TagHelperNode, Node);

TagHelperNode.prototype.getResolvedArguments = function(context){
    var resolved_arguments = [];
    
    if (this.args){
        this.args.forEach(function(variable){
            resolved_arguments.push(variable.resolve(context));
        });
    }

    if (this.takes_context){
        resolved_arguments.unshift(context);
    }
    
    if (this.kwargs){
        var resolved_kwargs = {};
        Object.entries(this.kwargs).forEach(function(entry){
            var k = entry[0];
            var v = entry[1];

            resolved_kwargs[k] = v.resolve(context);
        });
        resolved_arguments.push(resolved_kwargs);
    }

    return resolved_arguments;
}

var SimpleNode = function(func, takes_context, args, kwargs, target_var){
    this.target_var = target_var || null;
    SimpleNode.baseConstructor.call(this, func, takes_context, args, kwargs);
}

inherits(SimpleNode, TagHelperNode);


SimpleNode.prototype.render = function(context){
    var resolved_arguments = this.getResolvedArguments(context);

    var output = this.func.apply(null, resolved_arguments);
    if (this.target_var !== null){
        context.set(this.target_var, output);
        return ''
    }

    if (context.autoescape)
        output = conditionalEscape(output);

    return output
}


var InclusionNode = function(func, takes_context, args, kwargs, template_name){
    this.template_name = template_name;
    InclusionNode.baseConstructor.call(this, func, takes_context, args, kwargs);
}

inherits(InclusionNode, TagHelperNode);


InclusionNode.prototype.render = function(context){
    /*
    Render the specified template and context. Cache the template object
    in renderContext to avoid reparsing and loading when used in a for
    loop.
    */
    var resolved_arguments = this.getResolvedArguments(context);

    var _dict = this.func.apply(null, resolved_arguments);

    var t = context.template.engine.getTemplate(this.template_name);

    var new_context = context.newContext(_dict);
    // Copy across the CSRF token, if present, because inclusion tags are
    // often used for forms, and we need instructions for using CSRF
    // protection to be as simple as possible.
    var csrf_token = context.get('csrf_token');
    if (csrf_token !== null){
        new_context.get('csrf_token'. csrf_token);
    }
    return t.render(new_context);
}


var parse_bits = function(parser, bits, name){
    /*
    Parse bits for template tag helpers simpleTag and inclusionTag, in
    particular by detecting syntax errors and by extracting positional and
    keyword arguments.
    */

    var args = [];
    var kwargs = {};
    var handled_param_names = {};

    var handling_positional_args = true;

    bits.forEach(function(bit){
        // First we try to extract a potential kwarg from the bit
        var kwarg = token_kwargs([bit], parser);
        var kwarg_keys = Object.keys(kwarg);

        if (kwarg_keys.length !== 0){
            // The kwarg was successfully extracted
            if (handling_positional_args) handling_positional_args = false;

            param = kwarg_keys[0];
            value = kwarg[param];

            if (handled_param_names[param]){
                throw new TemplateSyntaxError("'" + name + "' received repeated param names");
            } else {
                handled_param_names[param] = true;
                kwargs[param] = value;
            }
        } else {
            if (handling_positional_args){
                // Record the positional argument
                args.push(parser.compileFilter(bit))                
            } else {
                throw new TemplateSyntaxError("'" + name + "' received some positional argument(s) after some keyword argument(s)");
            }
        }
    });

    return {
        'args': args,
        'kwargs': kwargs
    };
}


var BLOCK_CONTEXT_KEY = 'block_context'


var BlockContext = function(){
    // Dictionary of FIFO queues.
    this.blocks = {};
}

BlockContext.prototype.add_blocks = function(blocks){
    var self = this;

    Object.entries(blocks).forEach(function(entry){
        var name = entry[0];
        var block = entry[1];

        if (self.blocks[name] === undefined){
            self.blocks[name] = [block]
        } else {
            self.blocks[name].unshift(block);
        }
    });
}

BlockContext.prototype.pop = function(name){
    if (this.blocks[name] && this.blocks[name].length !== 0){
        return this.blocks[name].pop();
    }

    return null;
}

BlockContext.prototype.push = function(name, block){
    if (this.blocks[name] === undefined){
        this.blocks[name] = [block]
    } else {
        this.blocks[name].push(block);
    }
}

BlockContext.prototype.getBlock = function(name){
    if (this.blocks[name] && this.blocks[name].length !== 0){
        var blockList = this.blocks[name];
        return blockList[blockList.length-1];
    }

    return null;
}


var BlockNode = function(name, nodelist, parent){
    this.name = name;
    this.nodelist = nodelist;
    this.parent = parent || null;
    
    BlockNode.baseConstructor.call(this);
}

inherits(BlockNode, Node);

BlockNode.prototype.toString = function(){
    return "<Block Node: " + this.name + ". Contents: " + this.nodelist.toString() + ">";
}

BlockNode.prototype.render = function(context){
    var self = this;
    var block_context = context.renderContext.get(BLOCK_CONTEXT_KEY);


    return context.push(null, function(){
        var result;

        if (block_context === null){
            context.set('block', self);
            result = self.nodelist.render(context);
        } else {
            var push = block_context.pop(self.name);
            var block = push;

            if (block === null)
                block = self;

            // Create new block so we can store context without thread-safety issues.
            block = new self.constructor(block.name, block.nodelist);
            block.context = context;

            context.set('block', block);

            result = block.nodelist.render(context);
            if (push !== null)
                block_context.push(self.name, push);
        }

        return result;
    });
}

BlockNode.prototype.super = function(){
    if (!this.context) {
        throw new TemplateSyntaxError(
            "'" + this.constructor.name + "' object has no attribute 'context'. Did you use {{ block.super }} in a base template?"
        );
    }

    var renderContext = this.context.renderContext;

    if (renderContext.has(BLOCK_CONTEXT_KEY) && renderContext.get(BLOCK_CONTEXT_KEY).getBlock(this.name) !== null)
        return markSafe(this.render(this.context));

    return '';
}

var ExtendsNode = function(nodelist, parent_name){
    this.nodelist = nodelist
    this.parent_name = parent_name;

    var blocks = {};
    nodelist.getNodesByType(BlockNode).forEach(function(n){
        blocks[n.name] = n;
    });

    this.blocks = blocks;
    
    ExtendsNode.baseConstructor.call(this);
}

ExtendsNode.must_be_first = true;

inherits(ExtendsNode, Node);

ExtendsNode.prototype.toString = function(){
    return '<' + this.constructor.name + ': extends ' + this.parent_name.token + '>';
}

ExtendsNode.prototype.getParent = function(context){
    var parent = this.parent_name.resolve(context);
    if (!parent){
        var error_msg = "Invalid template name in 'extends' tag: " + parent + ".";

        if (this.parent_name.filters || (this.parent_name.variable instanceof Variable)) {
            error_msg += " Got this from the '" + this.parent_name.token + "' variable.";   
        }
        throw new TemplateSyntaxError(error_msg)
    }
    if (parent instanceof Template){
        // parent is a django.template.Template
        return parent
    }
    /*
    if (parent.template instanceof Template){
        // parent is a django.template.backends.django.Template
        return parent.template
    }*/

    return context.template.engine.getTemplate(parent);
}

ExtendsNode.prototype.render = function(context){
    var compiled_parent = this.getParent(context)

    if (!context.renderContext.has(BLOCK_CONTEXT_KEY)){
        context.renderContext.set(BLOCK_CONTEXT_KEY, new BlockContext());
    }

    var block_context = context.renderContext.get(BLOCK_CONTEXT_KEY);

    // Add the block nodes from this node to the block context
    block_context.add_blocks(this.blocks);

    // If this block's parent doesn't have an extends node it is the root, and its block nodes also need to be added to the block context.
    var nodelist = compiled_parent.nodelist;
    for (var i =0, nodelist_length = nodelist.length; i<nodelist_length; i++) {
        var node = nodelist[i];

        // The ExtendsNode has to be the first non-text node.
        if (! (node instanceof TextNode)){
            if (! (node instanceof ExtendsNode)){
                var blocks = {};
                compiled_parent.nodelist.getNodesByType(BlockNode).forEach(function(node){
                    blocks[node.name] = node;
                });

                block_context.add_blocks(blocks);
            }
            break
        }
    };

    // Call Template._render explicitly so the parser context stays the same.
    return context.renderContext.pushState(compiled_parent, function(){
        return compiled_parent._render(context);
    }, false);
}

var IncludeNode = function(template, extra_context, isolated_context){
    this.template = template;
    this.extra_context = extra_context || null;
    this.isolated_context = isolated_context || false;
    
    IncludeNode.baseConstructor.call(this);
}

inherits(IncludeNode, Node);

IncludeNode.prototype.render = function(context){
    /*
    Render the specified template and context. Cache the template object
    in renderContext to avoid reparsing and loading when used in a for
    loop.
    */
    var template = this.template.resolve(context);
    // Does this quack like a Template?
    if (!isFunction(template.render)){
        template = context.template.engine.getTemplate(template);
    }

    var values = {}

    if (!this.extra_context){
        this.extra_context.entries().forEach(function(entry){
            values[entry[0]] = entry[1].resolve(context);
        });
    }

    if (this.isolated_context)
        return template.render(context.newContext(values));

    return context.push(values, function(){
        return template.render(context);
    });
}

defaultTemplateLibrary.tag('block', function(parser, token){
    /*
    Define a block that can be overridden by child templates.
    */
    // token.splitContents() isn't useful here because this tag doesn't accept variable as arguments
    var bits = token.contents.split(/\s+/)

    if (bits.length != 2)
        throw new TemplateSyntaxError("'" + bits[0] + "' tag takes only one argument" );
    var block_name = bits[1];
    // Keep track of the names of BlockNodes found in this template, so we can check for duplication.

    if (parser.__loaded_blocks === undefined){
        parser.__loaded_blocks = [block_name];
    } else {
        if (parser.__loaded_blocks.indexOf(block_name) !== -1)
            throw new TemplateSyntaxError("'" +  bits[0] + "' tag with name '" + block_name + "'; appears more than once");
        parser.__loaded_blocks.push(block_name)
    }
     
    var nodelist = parser.parse(['endblock'])

    // This check is kept for backwards-compatibility. See #3100.
    var endblock = parser.nextToken()
    var acceptable_endblocks = ['endblock', 'endblock ' + block_name];

    if (acceptable_endblocks.indexOf(endblock.contents) === -1){
        parser.invalidBlockTag(endblock, 'endblock', acceptable_endblocks)
    }

    return new BlockNode(block_name, nodelist);
});

defaultTemplateLibrary.tag('extends', function(parser, token){
    /*
    Signal that this template extends a parent template.

    This tag may be used in two ways: ``{% extends "base" %}`` (with quotes)
    uses the literal value "base" as the name of the parent template to extend,
    or ``{% extends variable %}`` uses the value of ``variable`` as either the
    name of the parent template to extend (if it evaluates to a string) or as
    the parent template itself (if it evaluates to a Template object).
    */
    var bits = token.splitContents();
    if (bits.length != 2)
        throw new TemplateSyntaxError("'" + bits[0] + "' takes one argument");

    var parent_name = parser.compileFilter(bits[1]);
    var nodelist = parser.parse();

    if (nodelist.getNodesByType(ExtendsNode).length !== 0){
        throw new TemplateSyntaxError("'"+ bits[0] + "' cannot appear more than once in the same template");
    }
    return new ExtendsNode(nodelist, parent_name);
});

defaultTemplateLibrary.tag('include', function(parser, token){
    /*
    Load a template and render it with the current context. You can pass
    additional context using keyword arguments.

    Example::

        {% include "foo/some_include" %}
        {% include "foo/some_include" with bar="BAZZ!" baz="BING!" %}

    Use the ``only`` argument to exclude the current context when rendering
    the included template::

        {% include "foo/some_include" only %}
        {% include "foo/some_include" with bar="1" only %}
    */
    var value;

    var bits = token.splitContents();
    if (bits.length < 2){
        throw new TemplateSyntaxError(
            bits[0] + " tag takes at least one argument: the name of the template to be included."
        )
    }

    var options = {};
    var remaining_bits = bits.splice(2);

    while (remaining_bits.length != 0){
        var option = remaining_bits.shift();
        if (options.hasOwnProperty(option)){
            throw new TemplateSyntaxError('The ' + option + ' option was specified more than once.');
        }

        if (option === 'with') {
            value = token_kwargs(remaining_bits, parser, false)
            if (Object.keys(value).length === 0){
                throw new TemplateSyntaxError('"with" in ' + bits[0] + ' tag needs at least one keyword argument.')
            }
        } else if (option === 'only'){
            value = true;
        } else {
            throw new TemplateSyntaxError('Unknown argument for ' + bits[0] + ' tag: ' +  option + '.');
        }
        options[option] = value;
    }

    var isolated_context = options['only'] || false;
    var namemap = options['with'] || {};

    return new IncludeNode(parser.compileFilter(bits[1]), namemap, isolated_context);
});


defaultTemplateLibrary.filter('noop', function(value) {
    /*
    For testing purpose only.
    */
    return value;
})


defaultTemplateLibrary.filter('return_arg', function(value, arg) {
    /*
    For testing purpose only.
    */
    return arg;
})


/*
* STRINGS
*/
defaultTemplateLibrary.stringfilter('addslashes', function(str) {
    /*
    Add slashes before quotes. Useful for escaping strings in CSV, for
    example. Less useful for escaping JavaScript; use the ``escapejs``
    filter instead.
    */
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
}, {
    is_safe: true
})

defaultTemplateLibrary.stringfilter('escapejs', function(str) {
    // Hex encode characters for use in JavaScript strings.
    return escapeJs(str)
});


defaultTemplateLibrary.filter('floatformat', function(value, arg) {
    /*
    Display a float to a specified number of decimal places.

    If called without an argument, display the floating point number with one
    decimal place -- but only if there's a decimal place to be displayed:

    * num1 = 34.23234
    * num2 = 34.00000
    * num3 = 34.26000
    * {{ num1|floatformat }} displays "34.2"
    * {{ num2|floatformat }} displays "34"
    * {{ num3|floatformat }} displays "34.3"

    If arg is positive, always display exactly arg number of decimal places:

    * {{ num1|floatformat:3 }} displays "34.232"
    * {{ num2|floatformat:3 }} displays "34.000"
    * {{ num3|floatformat:3 }} displays "34.260"

    If arg is negative, display arg number of decimal places -- but only if
    there are places to be displayed:

    * {{ num1|floatformat:"-3" }} displays "34.232"
    * {{ num2|floatformat:"-3" }} displays "34"
    * {{ num3|floatformat:"-3" }} displays "34.260"

    If the input float is infinity or NaN, display the string representation
    of that value.
    */

    if (arg === undefined || arg === null) {
        arg = -1;
    } else {
        arg = arg + '';
    }

    var number = parseFloat(value);
    // If value is invalid short circuit.
    if (isNaN(number)) {
        return '';
    }

    arg = parseInt(arg, 10);
    // If arg is a valid Integer.
    if (isNaN(arg)) {
        return "'" + value + "'";
    }

    var result = floatformat(number, arg);

    return markSafe(result);
}, {
    "is_safe": true,
})


var QUOTES = '":/_#?;@&=+$,"%[]<>\\';
var QUOTE_MAP = {};

for (var i = 0; i < QUOTES.length; i += 1) {
  QUOTE_MAP[QUOTES[i].charCodeAt(0)] = `${QUOTES[i]
    .charCodeAt(0)
    .toString(16)
    .toUpperCase()}`;
}


defaultTemplateLibrary.stringfilter('iriencode', function(str) {
  // Escape an IRI value for use in a URL.
  var encoded = encodeURI(str);
  // Losesly test if value is double encoded. Not really fool proof.
  encoded = encoded.replace(/%25[A-Z0-9]{2}/g, item => item.replace('25', ''));
  return translateMap(encoded, QUOTE_MAP);
}, {
    "is_safe": true
});


defaultTemplateLibrary.stringfilter('linenumbers', function(str, arg, autoescape) {
    // Display text with line numbers.
    var autoescape = autoescape && !(str instanceof SafeString);

    var lines = str.split('\n');

    // Find the maximum width of the line count, for use with zero padding string format command
    var width = String(lines.length).length;

    return lines.map(
        (line, index) =>
        `${String(index + 1).padStart(width, '0')}. ${
        autoescape ? escapeHtml(line) : line
        }`
     ).join('\n');
}, {
    "is_safe": true,
    "needs_autoescape": true
})


defaultTemplateLibrary.stringfilter('lower', function(str) {
    // Convert a string into all lowercase.
    return str.toLowerCase()
}, {
    "is_safe": false,
})


defaultTemplateLibrary.stringfilter('upper', function(str) {
    // Convert a string into all uppercase.
    return str.toUpperCase()
}, {
    "is_safe": false,
})


defaultTemplateLibrary.stringfilter('capfirst', function(str) {
    /* Capitalize the first character of the value.*/

    // return str[0].toUpperCase() + str.substr(1)
    return str.charAt(0).toUpperCase() + str.slice(1);
}, {
    "is_safe": false,
})


defaultTemplateLibrary.stringfilter('make_list', function(str) {
    /*
    Return the value turned into a list.

    For an integer, it's a list of digits.
    For a string, it's a list of characters.
    */
    return str.split('')
}, {
    "is_safe": false,
})


defaultTemplateLibrary.stringfilter('slugify', function(str) {
  /*
    Convert to ASCII. Convert spaces to hyphens. Remove characters that aren't
    alphanumerics, underscores, or hyphens. Convert to lowercase. Also strip
    leading and trailing whitespace.
  */
  return str
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase().replace(/[-\s]+/g, '-');
}, {
    "is_safe": true,
})


defaultTemplateLibrary.filter('stringformat', function(value, arg) {
    /*
    Format the variable according to the arg, a string formatting specifier.

    This specifier uses Python string formatting syntax, with the exception
    that the leading "%" is dropped.

    See https://docs.python.org/library/stdtypes.html#printf-style-string-formatting
    for documentation of Python string formatting.
    */

    return sprintf(`%${arg}`, value);
}, {
    "is_safe": true,
})


defaultTemplateLibrary.stringfilter('title', function(str) {
  /* Convert a string into titlecase. */

//    return str.replace(/\w\S*/g, function (bit) {
//        return bit.charAt(0).toUpperCase() + bit.substr(1).toLowerCase();
//    });

    var bits = str.split(/\s{1}/g)
      , out = [];
  
    while(bits.length) {
        var word = bits.shift();
        word = word.charAt(0).toUpperCase() + word.slice(1);
        out.push(word);
    }

    out = out.join(' ');
    out = out.replace(/([a-z])'([A-Z])/g, function(m) { return m.toLowerCase() });
    out = out.replace(/\d([A-Z])/g, function(m) { return m.toLowerCase() });

    return out;
}, {
    "is_safe": true,
})



defaultTemplateLibrary.stringfilter('truncatechars', function(str, arg) {
  // Truncate a string after `arg` number of characters.

    var length = parseInt(arg, 10);
    if (isNaN(length) || length >= str.length) {
        return str;
    }

    return new Truncator(str).chars(length);
}, {
    "is_safe": true,
})


defaultTemplateLibrary.stringfilter('truncatechars_html', function(str, arg) {
  // Truncate HTML after `arg` number of chars. Preserve newlines in the HTML.
  var length = parseInt(arg, 10);

  if (isNaN(length)) {
    // Invalid literal for parseInt().
    return str  // Fail silently.
  }

  if (length - 3 < 0) {
    return '...';
  }

  if (length >= str.length - 3) {
    return str;
  }

  return new Truncator(str).chars(length, true);
}, {
    "is_safe": true,
})


defaultTemplateLibrary.stringfilter('truncatewords', function(str, arg) {
  /* Truncate a string after `arg` number of words. Remove newlines within the string. */

  var length = parseInt(arg, 10);
  if (isNaN(length) || length >= str.length) {
    return str;
  }

  return new Truncator(str).words(length, ' ...');
}, {
    "is_safe": true,
})


defaultTemplateLibrary.stringfilter('truncatewords_html', function(str, arg) {
  /*     Truncate HTML after `arg` number of words. Preserve newlines in the HTML. */

  var length = parseInt(arg, 10);

  if (isNaN(length) || length >= str.length) {
    return str;
  }

  return new Truncator(str).words(length, ' ...', true);
}, {
    "is_safe": true,
})


defaultTemplateLibrary.filter('urlencode', function(value) {
  // Escape a value for use in a URL.
  if (isString(value)) {
    return encodeURIComponent(value);
  } else {
    var keyvals = (isArray(value)) ? value : Object.entries(value);
    return keyvals.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  }
}, {
    "is_safe": false,
});


// TODO: Mejorar. Usar libreria
defaultTemplateLibrary.stringfilter('urlize', function(str, arg) {
  // Convert URLs in plain text into clickable links.

  return markSafe(str.replace(/(((http(s)?:\/\/)|(mailto:))([\w\d\-\.:@\/])+)/g, function() {
    return '<a href="'+arguments[0]+'">'+arguments[0]+'</a>'; 
  }))
}, {
    "is_safe": true,
    "needs_autoescape": true
});

/*

@register.filter(is_safe=true, needs_autoescape=true)
@stringfilter
def urlizetrunc(value, limit, autoescape=true):
    """
    Convert URLs into clickable links, truncating URLs to the given character
    limit, and adding 'rel=nofollow' attribute to discourage spamming.

    Argument: Length to truncate URLs to.
    """
    return markSafe(_urlize(value, trim_url_limit=int(limit), nofollow=true, autoescape=autoescape))
*/

defaultTemplateLibrary.stringfilter('wordcount', function(str) {
    // Return the number of words.
    return str.trim().split(/\s+/).length
}, {
    "is_safe": false,
})


defaultTemplateLibrary.stringfilter('wordwrap', function(str, arg) {
    // Wrap words at `arg` line length.
    var width = parseInt(arg);

    if (isNaN(width) || width < 0){
        throw new TemplateSyntaxError("Filter argument must be a positive number")
    }

    return wrap(str, width);
}, {
    "is_safe": true,
})


defaultTemplateLibrary.stringfilter('ljust', function(str, arg) {
    // Left-align the value in a field of a given width.
    var width = parseInt(arg);

    if (isNaN(width)){
        throw new TemplateSyntaxError("Filter argument must be a number")
    }

    return str.padEnd(width, ' ');
}, {
    "is_safe": true,
})


defaultTemplateLibrary.stringfilter('rjust', function(str, arg) {
    // Right-align the value in a field of a given width.
    var width = parseInt(arg);

    if (isNaN(width)){
        throw new TemplateSyntaxError("Filter argument must be a number")
    }

    return str.padStart(width, ' ');
}, {
    "is_safe": true,
})


defaultTemplateLibrary.stringfilter('center', function(str, arg) {
    // Center the value in a field of a given width.

    var width = parseInt(arg);

    if (isNaN(width)){
        throw new TemplateSyntaxError("Filter argument must be a number")
    }

    str = centerText(str, width);
    return str;
}, {
    "is_safe": true,
})


defaultTemplateLibrary.stringfilter('cut', function(str, arg) {
    // Remove all values of arg from the given string.

    var safe = str instanceof SafeString;

    var search = new RegExp(arg, 'g');
    str = str.replace(search, '');

    if (safe && arg !== ';'){
        return markSafe(str);
    }
    return str;
});


/*
* HTML STRINGS
*/
defaultTemplateLibrary.stringfilter('escape', function(str) {
    // Mark the value as a string that should be auto-escaped.
    return conditionalEscape(value)
}, {
    "is_safe": true,
});


defaultTemplateLibrary.stringfilter('force_escape', function(str) {
    /*
    Escape a string's HTML. Return a new string containing the escaped
    characters (as opposed to "escape", which marks the content for later
    possible escaping).
    */

    return escapeHtml(str)
}, {
    "is_safe": true,
});



defaultTemplateLibrary.stringfilter('linebreaks', function(str, arg, autoescape) {
  /*
    Replace line breaks in plain text with appropriate HTML; a single
    newline becomes an HTML line break (``<br>``) and a new line
    followed by a blank line becomes a paragraph break (``</p>``).
  */

  var autoescape = autoescape && !(str instanceof SafeString);
  return markSafe(
    normalizeNewlines(str)
      .split(/\n{2,}/g)
      .map(function(sentence){
        var output = autoescape ? escapeHtml(sentence) : sentence;
        return '<p>' + output.replaceAll('\n', '<br>') + '</p>';
      })
      .join('')
  );
}, {
    "is_safe": true,
    "needs_autoescape": true
});


defaultTemplateLibrary.stringfilter('linebreaksbr', function(str, arg, autoescape) {
  /*
    Convert all newlines in a piece of plain text to HTML line breaks (``<br>``).
  */

  var autoescape = autoescape && !(str instanceof SafeString);
  let output = normalizeNewlines(str);

  if (autoescape) {
    output = escapeHtml(output);
  }
  return markSafe(output.replace(/\n/g, '<br>'));

}, {
    "is_safe": true,
    "needs_autoescape": true
});


defaultTemplateLibrary.stringfilter('safe', function(str) {
    /*
    Mark the value as a string that should not be auto-escaped.
    */

    return markSafe(str)
}, {
    "is_safe": true,
});


defaultTemplateLibrary.filter('safeseq', function(value) {
    /*
    A "safe" filter for sequences. Mark each element in the sequence,
    individually, as safe, after converting them to strings. Return a list
    with the results.
    */

    return value.map(function(obj){ return markSafe(obj) });
}, {
    "is_safe": true,
});


defaultTemplateLibrary.stringfilter('striptags', function(str) {
    /*
    Strip all [X]HTML tags.
    */

    // TODO: Revisar
    return str.replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, '')

//    var el = document.createElement("div");
//    el.innerHTML = str;

//    var text = Array.prototype.slice.call(div.childNodes).filter(function(node){return node.nodeType === Node.TEXT_NODE}).map(function(node){return node.nodeValue}).join("");
//    return text;
}, {
    "is_safe": true,
});


/******************
* LISTS           *
*******************/

defaultTemplateLibrary.filter('dictsort', function(value, arg){
    /*
    Given a list of dicts, return that list sorted by the property given in
    the argument.
    */
    return dictsort(value, arg)
}, {
    "is_safe": false,
});


defaultTemplateLibrary.filter('dictsortreversed', function(value, arg) {
    /*
    Given a list of dicts, return that list sorted in reverse order by the
    property given in the argument.
    */
    return dictsort(value, arg).reverse();
}, {
    "is_safe": false,
});


defaultTemplateLibrary.filter('first', function(input) {
    // Return the first item in a list.

    var value = input[0];
    if (value === undefined) value = '';

    return value;
}, {
    "is_safe": false,
});

defaultTemplateLibrary.filter('last', function(input) {
    // Return the last item in a list.

    if (input.length === undefined || input.length === 0) return "";
    var cb = input.charAt || function(ind) { return input[ind]; }

    return cb.call(input, input.length-1);
}, {
    "is_safe": true,
});


defaultTemplateLibrary.filter('join', function(value, arg, autoescape) {
  if (!isArray(value)){
    return value;
  }

  if (autoescape) {
    value = value.map(conditionalEscape);
  }

  var delimeter = conditionalEscape(arg);

  return markSafe(value.join(delimeter));
}, {
    "is_safe": true,
    "needs_autoescape": true
});


defaultTemplateLibrary.filter('reverse', function(value) {
    if (Array.isArray(value)) {
        return value.reverse();
    } else {
        return value;
    }
}, {
    "is_safe": false,
});


defaultTemplateLibrary.filter('length', function(value) {
  // Return the length of the value - useful for lists

    return value.length === undefined ? 0: value.length;
}, {
    "is_safe": false,
});

defaultTemplateLibrary.filter('repeat_arr', function(value, arg) {
    return repeat(value, arg);
}, {
    "is_safe": false,
});


defaultTemplateLibrary.filter('length_is', function(value, arg) {
  // Return a boolean of whether the value's length is the argument.

    if (value.length === undefined) {
        return '';
    }

    // Is it decimal?
    const length = parseFloat(arg);
    if (length % 1 !== 0) {
        return '';
    }

    return value.length === parseInt(arg, 10);
}, {
    "is_safe": false,
});


defaultTemplateLibrary.filter('random', function(value) {
  // Return a random item from the list.
  return value[Math.floor(Math.random() * value.length)];
}, {
    "is_safe": true,
});


defaultTemplateLibrary.filter('slice', function(value, arg) {
    var sliceParams = String(arg).split(':').map(function(i){ 
        if (i === "") {
            return null;
        } else {
            i = parseInt(i);

            if (isNaN(i)) return null;
            return i;
        }
    });

    for (var i=sliceParams.length; i < 3; i++){
        sliceParams.push(null);
    }

    var start = sliceParams[0];
    var stop = sliceParams[1];
    var step = sliceParams[2];
    
    var result = slice_list(value, start, stop, step);
    return result;
}, {
    "is_safe": true,
});


defaultTemplateLibrary.filter('unordered_list', function(value, arg, autoescape) {
    /*
    Recursively take a self-nested list and return an HTML unordered list --
    WITHOUT opening and closing <ul> tags.

    Assume the list is in the proper format. For example, if ``var`` contains:
    ``['States', ['Kansas', ['Lawrence', 'Topeka'], 'Illinois']]``, then
    ``{{ var|unordered_list }}`` returns::

        <li>States
        <ul>
                <li>Kansas
                <ul>
                        <li>Lawrence</li>
                        <li>Topeka</li>
                </ul>
                </li>
                <li>Illinois</li>
        </ul>
        </li>
    */

    var escaper;

    if (autoescape){
        escaper = conditionalEscape
    } else {
        escaper = function(x){return x};
    }

    function walk_items(item_list, f){
        var item;

        for (var i = 0; i < item_list.length; i++){
            item = item_list[i];

            if (i === item_list.length -1){
                f(item, null);
            } else {
                if (isArray(item_list[i+1])){
                    i += 1;
                    f(item, item_list[i]);
                } else {
                    f(item, null);
                }
            }
        }
    }

    function list_formatter(item_list, tabs){
        var indent = '\t'.repeat(tabs);
        var output = [];

        walk_items(item_list, function(item, children){
            var sublist = ''
            if (children && children.length !== 0){
                sublist = '\n' + indent +'<ul>\n' + list_formatter(children, tabs + 1) + '\n' + indent + '</ul>\n'+ indent;
            }
            output.push(indent + '<li>' + escaper(item) + sublist + '</li>');
        });
        return output.join('\n');
    }

    return markSafe(list_formatter(value, 1))
});


/******************/
/* INTEGERS       */
/******************/

defaultTemplateLibrary.filter('add', function(value, arg) {
  return parseInt(value, 10) + parseInt(arg, 10)
}, {
    "is_safe": false,
})


defaultTemplateLibrary.filter('get_digit', function(value, arg) {
    /*
    Given a whole number, return the requested digit of it, where 1 is the
    right-most digit, 2 is the second-right-most digit, etc. Return the
    original value for invalid input (if input or argument is not an integer,
    or if argument is less than 1). Otherwise, output is always an integer.
    */

    var arg = parseInt(arg);

    if( isNaN(parseInt(value)) || isNaN(arg)){
        return value;
    }

    var str = value.toString(), len = str.length;

    if (arg < 1 || arg > len){
        return value;
    }

    return str.charAt(len - digit)
}, {
    "is_safe": false,
})


/******************/
/* DATES          */
/******************/

defaultTemplateLibrary.filter('time', function(value, arg) {
    // Format a time according to the given format.

    var value = parseDateValue(value);
    if (value === null) throw new TemplateError("Filter value is not a valid date.");

    if (arg === undefined || arg === null){
        arg = DJANGO_TEMPLATE_SETTINGS.DEFAULT_TIME_FORMAT;
    }

    return time_format(value, arg);
}, {
    "is_safe": false
})


defaultTemplateLibrary.filter('timesince', function(value, arg) {
    // Format a date as the time until that date (i.e. "4 days, 6 hours").
    var value = parseDateValue(value);
    if (value === null) throw new TemplateError("Filter value is not a valid date.");


    var now;
    if (arg === undefined || arg === null){
        now = new Date();
    } else {
        now = parseDateValue(arg);
        if (now === null) throw new TemplateError("Filter argument is not a valid date.");
    }

    return timesince(value, now)
}, {
    "is_safe": false
})


defaultTemplateLibrary.filter('timeuntil', function(value, arg) {
    // Format a date as the time until that date (i.e. "4 days, 6 hours").
    var value = parseDateValue(value);
    if (value === null) throw new TemplateError("Filter value is not a valid date.");

    var now;
    if (arg === undefined || arg === null){
        now = new Date();
    } else {
        now = parseDateValue(arg);
        if (now === null) throw new TemplateError("Filter argument is not a valid date.");
    }
  
    return timesince(now, value)
}, {
    "is_safe": false
})


defaultTemplateLibrary.filter('date', function(value, arg) {
    // Format a date according to the given format.
    var value = parseDateValue(value);
    if (value === null) throw new TemplateError("Filter value is not a valid date.");
 
    if (arg === undefined || arg === null){
        arg = DJANGO_TEMPLATE_SETTINGS.DEFAULT_DATE_TIME_FORMAT;
    }
    
    return date_time_format(value, arg);
}, {
    "is_safe": false
})


/******************
* LOGIC           *
*******************/

defaultTemplateLibrary.filter('default', function(value, arg) {
    // If value is unavailable, use given default.

    return value || arg;
}, {
    "is_safe": false,
})


defaultTemplateLibrary.filter('default_if_none', function(value, arg) {
    // If value is null, use given default.

    if (value === null){
        return arg
    }

    return value
}, {
    "is_safe": false,
})


defaultTemplateLibrary.filter('divisibleby', function(value, arg) {
    // Return true if the value is divisible by the argument."""

    return parseInt(value, 10) % parseInt(arg, 10) === 0;
}, {
    "is_safe": false,
})


defaultTemplateLibrary.filter('yesno', function(value, arg) {
    /*
    Given a string mapping values for true, false, and (optionally) null,
    return one of those strings according to the value:

    ==========  ======================  ==================================
    Value       Argument                Outputs
    ==========  ======================  ==================================
    ``true``    ``"yeah,no,maybe"``     ``yeah``
    ``false``   ``"yeah,no,maybe"``     ``no``
    ``null``    ``"yeah,no,maybe"``     ``maybe``
    ``null``    ``"yeah,no"``           ``"no"`` (converts null to false
                                        if no mapping for null is given.
    ==========  ======================  ==================================
    */

    if (!arg){
        arg = _('yes,no,maybe')
    }

    var bits = arg.toString().split(',');

    if (bits.length < 2) {
        return value  // Invalid arg.
    }

    // no "maybe" value provided ?
    bits.length < 3 && bits.push(bits[1])

    var yes = bits[0];
    var no = bits[1];
    var maybe = bits[2];

    if (value === '' || value === null || value === undefined){
        return maybe;
    }

    if (value){
        return yes;
    } else {
        return no;
    }

}, {
    "is_safe": false,
})
 

/********************/
/* MISC             */ 
/********************/

defaultTemplateLibrary.filter('filesizeformat', function(value) {
    /*
    Format the value like a 'human-readable' file size (i.e. 13 KB, 4.1 MB,
    102 bytes, etc.).
    */

    var bytes = parseFloat(value);

    if (isNaN(bytes)) {
        return '0 bytes';
    }

    var sign = Math.sign(bytes);
    var singular = bytes == 1 ? '' : 's';

    bytes = Math.abs(bytes);

    var KB = 1 << 10
    var MB = 1 << 20
    var GB = 1 << 30
    var TB = 1 << 40
    var PB = 1 << 50

    var output =
        bytes < KB ? bytes + ' byte'+singular :
        bytes < MB ? parseInt(bytes / KB) + ' KB' :
        bytes < GB ? parseInt(bytes / MB) + ' MB' :
        bytes < TB ? parseInt(bytes / GB) + ' GB' :
        bytes < PB ? parseInt(bytes / TB) + ' TB' :
        bytes / PB + ' PB';

    if (sign === -1) {
        output = "-" + output;
    }

    return output;
}, {
    is_safe: true
})


defaultTemplateLibrary.filter('pluralize', function(input, plural) {
/*    
    Return a plural suffix if the value is not 1, '1', or an object of
    length 1. By default, use 's' as the suffix:

    * If value is 0, vote{{ value|pluralize }} display "votes".
    * If value is 1, vote{{ value|pluralize }} display "vote".
    * If value is 2, vote{{ value|pluralize }} display "votes".

    If an argument is provided, use that string instead:

    * If value is 0, class{{ value|pluralize:"es" }} display "classes".
    * If value is 1, class{{ value|pluralize:"es" }} display "class".
    * If value is 2, class{{ value|pluralize:"es" }} display "classes".

    If the provided argument contains a comma, use the text before the comma
    for the singular case and the text after the comma for the plural case:

    * If value is 0, cand{{ value|pluralize:"y,ies" }} display "candies".
    * If value is 1, cand{{ value|pluralize:"y,ies" }} display "candy".
    * If value is 2, cand{{ value|pluralize:"y,ies" }} display "candies".
*/
    var bits = ((plural === undefined || plural === null) ? 's': plural ).split(',')

    if (bits.length > 2) return '';

    if (bits.length === 1){
        bits.unshift("");
    }

    var singular_suffix = bits[0];
    var plural_suffix = bits[1];

    var val = Number(input), suffix;

    if (isNaN(val)){
        val = val.length;
        if (isNaN(val)) return '';
    }

    if(val === 1) {
        return singular_suffix;
    } else {
        return plural_suffix;
    }
}, {
    is_safe: false
})


defaultTemplateLibrary.filter('phone2numeric', function(value) {
    // Take a phone number and converts it in to its numerical equivalent.

    var LETTERS = {
        'a': '2', 'b': '2', 'c': '2', 'd': '3', 'e': '3',
        'f': '3', 'g': '4', 'h': '4', 'i': '4', 'j': '5', 'k': '5', 'l': '5',
        'm': '6', 'n': '6', 'o': '6', 'p': '7', 'q': '7', 'r': '7', 's': '7',
        't': '8', 'u': '8', 'v': '8', 'w': '9', 'x': '9', 'y': '9', 'z': '9'
    };

    var str = input.toString().toLowerCase().split('')
        , out = []
        , ltr;

    while(str.length) {
        ltr = str.pop();
        out.unshift(LETTERS[ltr] ? LETTERS[ltr] : ltr);
    }

    return out.join('');
}, {
    is_safe: true
})


function stringify(value){
  if (value === null){
    return value;
  } else if (value === true || value === false) {
    return value;
  } else if (value instanceof SafeString) {
    return String(value.toString());
  } else if (typeof value === 'number') {
    return value ;
  } else if (typeof value === 'function') {
    return `[Function: ${value.name}]`;
  } else if (Array.isArray(value)) {
    return value.map(item => stringify(item));
  } else if (typeof value === 'object') {
    return Object.keys(value).reduce((accum, key) => {
      accum[key] = stringify(value[key]);
      return accum;
    }, {});
  }

  return value;
};

function pformat(value){
    return JSON.stringify(stringify(value), null, 2);
}

defaultTemplateLibrary.filter('pprint', function(value) {
    return pformat(value)
}, {
    is_safe: true
})



var AutoEscapeControlNode = function(autoescapeSetting, nodelist){
    /* Implement the actions of the autoescape tag.*/
    this.autoescapeSetting = autoescapeSetting;
    this.nodelist = nodelist;

    AutoEscapeControlNode.baseConstructor.call(this);
}

inherits(AutoEscapeControlNode, Node);


AutoEscapeControlNode.prototype.render = function(context){
    var autoescape = context.autoescape;

    context.autoescape = this.autoescapeSetting;
    var output = this.nodelist.render(context);
    context.autoescape = autoescape;
    if (this.autoescapeSetting){
        return markSafe(output);
    } else{
        return output;
    }
}


var CommentNode = function(){
    CommentNode.baseConstructor.call(this);
}

inherits(CommentNode, Node);


CommentNode.prototype.render = function(context){
    return ''
}


var CycleNode = function(cyclevars, variable_name, silent){
    variable_name = variable_name || null;
    if (silent === undefined) silent = false;

    this.cyclevars = cyclevars;
    this.variable_name = variable_name;
    this.silent = silent;

    CycleNode.baseConstructor.call(this);
}

inherits(CycleNode, Node);


CycleNode.prototype.render = function(context){
    if (!context.renderContext.has(this._nodeKey)){
        // First time the node is rendered in template
        context.renderContext.set(this._nodeKey, cycler(this.cyclevars));
    }

    var cycle_iter = context.renderContext.get(this._nodeKey);
    var value = cycle_iter.next().resolve(context);

    if (this.variable_name){
        context.setUpward(this.variable_name, value)
    }

    if (this.silent){
        return ''
    }

    return render_value_in_context(value, context);
}

CycleNode.prototype.reset = function(context){
    // Reset the cycle iteration back to the beginning.
    context.renderContext.set(this._nodeKey, cycler(this.cyclevars));
}


var DebugNode = function(){
    DebugNode.baseConstructor.call(this);
}

inherits(DebugNode, Node);


DebugNode.prototype.render = function(context){
    //
    output = []
    context.forEach(function(key, value){
        output.push(key + ": " + pformat(value));
    });
    return output.join('\n');
}


var FilterNode = function(filter_expr, nodelist){
    this.filter_expr = filter_expr;
    this.nodelist = nodelist;

    FilterNode.baseConstructor.call(this);
}

inherits(FilterNode, Node);


FilterNode.prototype.render = function(context){
    var self = this;

    var output = this.nodelist.render(context);
    // Apply filters.
    return context.push(output, function(){
        return self.filter_expr.resolve(context)
    });
}


var FirstOfNode = function(variables, asvar){
    this.vars = variables;
    this.asvar = asvar || null;

    FirstOfNode.baseConstructor.call(this);
}

inherits(FirstOfNode, Node);

FirstOfNode.prototype.render = function(context){
    var first = '';
    var varsLength = this.vars.length;

    for (i =0; i < varsLength; i++){
        var variable = this.vars[i];
        var value = variable.resolve(context, {ignore_failures: true});
        if (value){
            var first = render_value_in_context(value, context);
            break
        }
    }

    if (this.asvar){
        context.set(this.asvar, first);
        return '';
    }

    return first;
}

var ForNode = function(loopvars, sequence, is_reversed, nodelist_loop, nodelist_empty){
    if (nodelist_empty === undefined) nodelist_empty = null;

    this.loopvars = loopvars;
    this.sequence = sequence;

    this.is_reversed = is_reversed;

    this.nodelist_loop = nodelist_loop;

    if (nodelist_empty === null){
        this.nodelist_empty = new NodeList();
    } else {
        this.nodelist_empty = nodelist_empty
    }

    ForNode.baseConstructor.call(this);
}

inherits(ForNode, Node);

ForNode.prototype.child_nodelists = ['nodelist_loop', 'nodelist_empty'];

ForNode.prototype.toString = function(){
    var reversed_text = this.is_reversed ? ' reversed' : '';

    return '<' + this.constructor.name + ': for ' + this.loopvars.join(', ') + ' in ' + this.sequence + ', tail_len: ' + this.nodelist_loop.length + reversed_text + '>';
};


ForNode.prototype.render = function(context){
    var self = this;
    var parentloop = context.get('forloop');

    var nodelist = []

    context.push(null, function(){
        var values = self.sequence.resolve(context, true);
        if (values === null){
            values = []
        } else {
            if (!isArray(values)){
                values = [values];
            }
        }

        var len_values = values.length;

        if (len_values === 0) {
            return self.nodelist_empty.render(context)
        }

        if (self.is_reversed){
            values.reverse();
        }

        var num_loopvars = self.loopvars.length;

        var unpack = num_loopvars > 1;
        // Create a forloop value in the context.  We'll update counters on each iteration just below.
        var loop_dict = {'parentloop': parentloop}
        context.set('forloop', loop_dict);

        values.forEach(function(item, i){
            // Shortcuts for current loop iteration number.
            loop_dict['counter0'] = i;
            loop_dict['counter'] = i + 1;
            // Reverse counter iteration numbers.
            loop_dict['revcounter'] = len_values - i;
            loop_dict['revcounter0'] = len_values - i - 1;
            // Boolean values designating first and last times through loop.
            loop_dict['first'] = (i === 0);
            loop_dict['last'] = (i === len_values - 1);

            var pop_context = false;
            if (unpack){
                // If there are multiple loop variables, unpack the item into them.

                if (!isArray(item)){
                    item = [item];
                }

                var len_item = item.length;

                // Check loop variable count before unpacking
                if (num_loopvars !== len_item) {
                    throw new TemplateError("Need " + num_loopvars + " values to unpack in for loop; got " + len_item + ". ");
                }

                var unpacked_vars = {};
                self.loopvars.forEach(function(loopVarName, i){
                    unpacked_vars[loopVarName] = item[i];
                });

                pop_context = true;

                context.update(unpacked_vars)
            } else {
                context.set(self.loopvars[0], item);
            }

            self.nodelist_loop.forEach(function(node){
                nodelist.push(node.renderAnnotated(context))
            });

            if (pop_context){
                // Pop the loop variables pushed on to the context to avoid the context ending up in an inconsistent state when other tags (e.g., include and with) push data to context.
                context.pop()
            }
        });
    });

    return markSafe(nodelist.join(''));
}


var IfChangedNode = function(nodelist_true, nodelist_false, ...varlist){
    this.nodelist_true = nodelist_true;
    this.nodelist_false = nodelist_false;

    this._varlist = varlist;

    IfChangedNode.baseConstructor.call(this);
}

inherits(IfChangedNode, Node);

IfChangedNode.prototype.child_nodelists = ['nodelist_true', 'nodelist_false'];

IfChangedNode.prototype.render = function(context){
    // Init state storage
    var __repr__  = this.toString();
    var state_frame = this._getContextStackFrame(context)

    state_frame.setDefault(__repr__)

    var nodelist_true_output = null;
    var compare_to;

    if (this._varlist.length !== 0){
        // Consider multiple parameters. This behaves like an OR evaluation of the multiple variables.
        compare_to = this._varlist.map(function(variable){
            return variable.resolve(context, true) 
        });
    } else {
        // The "{% ifchanged %}" syntax (without any variables) compares the rendered output.
        compare_to = nodelist_true_output = this.nodelist_true.render(context);
    }

    if (compare_to != state_frame.get(__repr__)){
        state_frame.set(__repr__, compare_to);
        // render true block if not already rendered
        return nodelist_true_output || this.nodelist_true.render(context);
    } else if (this.nodelist_false){
        return this.nodelist_false.render(context);
    }

    return ''
}

IfChangedNode.prototype._getContextStackFrame = function(context){
    // The Context object behaves like a stack where each template tag can create a new scope.
    // Find the place where to store the state to detect changes.

    if (context.has('forloop')){
        // Ifchanged is bound to the local for loop.
        // When there is a loop-in-loop, the state is bound to the inner loop, so it resets when the outer loop continues.
        return new Dict(context.get('forloop'));
    } else {
        // Using ifchanged outside loops. Effectively this is a no-op because the state is associated with 'this'.
        return context.renderContext
    }
}

var IfEqualNode = function(var1, var2, nodelist_true, nodelist_false, negate){
    this.var1 = var1;
    this.var2 = var2;

    this.nodelist_true = nodelist_true;
    this.nodelist_false = nodelist_false;

    this.negate = negate

    IfEqualNode.baseConstructor.call(this);
}

IfEqualNode.prototype.child_nodelists = ['nodelist_true', 'nodelist_false'];

inherits(IfEqualNode, Node);

IfEqualNode.prototype.render = function(context){
    var val1 = this.var1.resolve(context, true);
    var val2 = this.var2.resolve(context, true);

    if ((this.negate && val1 != val2) || (! this.negate && val1 == val2)){
        return this.nodelist_true.render(context)
    }
    return this.nodelist_false.render(context);
}


var IfNode = function(conditions_nodelists){
    this.conditions_nodelists = conditions_nodelists
    this.__defineGetter__("nodelist", this.getNodelist.bind(this));

    IfNode.baseConstructor.call(this);
}

inherits(IfNode, Node);

IfNode.prototype.forEach = function(f){
    this.conditions_nodelists.forEach(function(condition_nodelist){
        var nodelist = condition_nodelist[1];
        nodelist.forEach(f);
    });
}

IfNode.prototype.getNodelist = function(){
    var nodes = []
    this.forEach(function(node){
        nodes.push(node);
    });

    return new NodeList(nodes);
}

IfNode.prototype.render = function(context){
    var condition_nodelist, condition_nodelist, condition, nodelist, match;

    for (var i = 0, conditions_nodelists_length=this.conditions_nodelists.length; i < conditions_nodelists_length; i++){
        condition_nodelist = this.conditions_nodelists[i];

        condition = condition_nodelist[0];
        nodelist = condition_nodelist[1];

        if (condition !== null){           // if / elif clause
            // TODO: Revisar. Puede que esta parte no funcione porque en el codigo original se levanta una excepcion
            match = condition.evaluate(context)

            if (match === VARIABLE_DOES_NOT_EXISTS) match = null;
        } else {                           // else clause
            match = true
        }

        if (match)
            return nodelist.render(context)

    }

    return ''
}

var LoremNode = function(count, method, common){
    this.count = count;
    this.method = method;
    this.common = common;

    LoremNode.baseConstructor.call(this);
}

inherits(LoremNode, Node);

LoremNode.prototype.render = function(context){
    var count = parseInt(this.count.resolve(context))
    if (isNaN(count)) count = 1;

    if (this.method == 'w'){
        return LoremIpsum.words(count, this.common)
    } else {
        return LoremIpsum.paragraphs(count, this.common)
        .map(para => `<p>${para}</p>`)
        .join('\n')
    }
}


var RegroupNode = function(target, expression, var_name){
    this.target = target;
    this.expression = expression;
    this.var_name = var_name;

    RegroupNode.baseConstructor.call(this);
}

inherits(RegroupNode, Node);

RegroupNode.prototype.resolveExpression = function(obj, context){
    // This method is called for each object in self.target. See regroup() for the reason why we temporarily put the object in the context.
    context.set(this.var_name, obj)
    return this.expression.resolve(context, true)
}

RegroupNode.prototype.render = function(context){
    var obj_list = this.target.resolve(context, true)
    if (obj_list === null){
        // target variable wasn't found in context; fail silently.
        context.set(this.var_name, []);
        return ''
    }
    // List of dictionaries in the format:
    // {'grouper': 'key', 'list': [list of contents]}.

    var group = groupBy(obj_list, item => this.resolveExpression(item, context));
    var grouped = Object.keys(group).map(key => ({
      grouper: key,
      list: group[key]
    }));

    context.set(this.var_name, grouped)

    return ''
}


var LoadNode = function(){
    LoadNode.baseConstructor.call(this);
}

inherits(LoadNode, Node);

LoadNode.prototype.render = function(context){
    return ''
}


var NowNode = function(format_string, asvar){
    this.format_string = format_string;
    this.asvar = asvar === undefined? null: asvar;

    NowNode.baseConstructor.call(this);
}

inherits(NowNode, Node);

NowNode.prototype.render = function(context){
    var formatted = date_time_format(new Date(), this.format_string);

    if (this.asvar){
        context.set(this.asvar, formatted);
        return ''
    } else {
        return formatted
    }
}


var ResetCycleNode = function(node){
    this.node = node;
    ResetCycleNode.baseConstructor.call(this);
}

inherits(ResetCycleNode, Node);

ResetCycleNode.prototype.render = function(context){
    this.node.reset(context);
    return '';
}


var SpacelessNode = function(nodelist){
    this.nodelist = nodelist;
    SpacelessNode.baseConstructor.call(this);
}

inherits(SpacelessNode, Node);

SpacelessNode.prototype.render = function(context){
    var renderedContent = this.nodelist.render(context);

    return renderedContent
        .trim()
        .replace(/>\s+</g, '><');
}

var TemplateTagNode = function(tagtype){
    this.tagtype = tagtype;
    TemplateTagNode.baseConstructor.call(this);
}

inherits(TemplateTagNode, Node);

TemplateTagNode.mapping = {
    'openblock': BLOCK_TAG_START,
    'closeblock': BLOCK_TAG_END,
    'openvariable': VARIABLE_TAG_START,
    'closevariable': VARIABLE_TAG_END,
    'openbrace': SINGLE_BRACE_START,
    'closebrace': SINGLE_BRACE_END,
    'opencomment': COMMENT_TAG_START,
    'closecomment': COMMENT_TAG_END,
}


TemplateTagNode.prototype.render = function(context){
    return this.constructor.mapping.get(this.tagtype, '')
}

// UrlNode
var TemplateStringNode = function(registered_template_strings, template_string_name, kwargs, asvar){
    this.registered_template_strings = registered_template_strings;
    this.template_string_name = template_string_name
    this.kwargs = kwargs
    this.asvar = asvar

    TemplateStringNode.baseConstructor.call(this);
}

inherits(TemplateStringNode, Node);

TemplateStringNode.prototype.render = function(context){
    var template_string_name = this.template_string_name.resolve(context);

    var template_string = this.registered_template_strings[this.template_string_name];

    if (template_string === undefined){
        if (this.asvar === null){
            throw new TemplateError("Template string does not exists: " + this.template_string_name);
        }

        context.set(this.asvar, "");
        return '';
    }

    var kwargs = {}
    Object.entries(this.kwargs).forEach(function(entry){
        kwargs[entry[0]] = entry[1].resolve(context);
    });

    var rendered_string = template_string.replace(/{(\w+?)}/g, function(s, m){return kwargs[m]});
    if (this.asvar){
        context.set(this.asvar, rendered_string);
        return '';
    } else {
        if (context.autoescape){
            rendered_string = conditionalEscape(rendered_string);
        }
        return rendered_string;
    }
}

//registered_template_strings


var VerbatimNode = function(content){
    this.content = content;
    VerbatimNode.baseConstructor.call(this);
}

inherits(VerbatimNode, Node);


VerbatimNode.prototype.render = function(context){
    return this.content
}


var WidthRatioNode = function(val_expr, max_expr, max_width, asvar){
    this.val_expr = val_expr;
    this.max_expr = max_expr;
    this.max_width = max_width;
    this.asvar = asvar || null;

    WidthRatioNode.baseConstructor.call(this);
}

inherits(WidthRatioNode, Node);

WidthRatioNode.prototype.getRatio = function(floatValue, floatMax, floatWidth){
    // Catch division by 0
    if (floatMax === 0) {
        return '0';
    }

    var ratio = (floatValue * floatWidth) / floatMax;

    if (isNaN(ratio)) {
        return '';
    }

    // Mimic python default rounding
    return String(-Math.round(-ratio));
}

WidthRatioNode.prototype.render = function(context){
    var value = this.val_expr.resolve(context);
    if (value === VARIABLE_DOES_NOT_EXISTS){
        return ''
    }

    var floatValue = parseFloat(value);

    if (isNaN(floatValue)){
        throw new TemplateSyntaxError("widthratio value argument must be a number")
    }

    var max_value = this.max_expr.resolve(context)
    if (max_value === VARIABLE_DOES_NOT_EXISTS){
        return ''
    }

    var floatMax = parseFloat(max_value);
    if (isNaN(floatMax)){
        throw new TemplateSyntaxError("widthratio max_value argument must be a number")
    }

    var max_width = this.max_width.resolve(context);
    if (max_width === VARIABLE_DOES_NOT_EXISTS){
        return ''
    }

    var floatWidth = parseFloat(max_width);
    if (isNaN(floatWidth)){
        throw new TemplateSyntaxError("widthratio max_width argument must be a number")
    }

    var result = this.getRatio(floatValue, floatMax, floatWidth);

    if (this.asvar){
        context.set(this.asvar, result);
        return ''
    } else {
        return result;
    }
}

var WithNode = function(variable, name, nodelist, extra_context){
    this.nodelist = nodelist
    // variable and name are legacy attributes, being left in case they are used by third-party subclasses of this Node.
    this.extra_context = extra_context || {};
    if (name)
        this.extra_context[name] = variable;

    WithNode.baseConstructor.call(this);
}

inherits(WithNode, Node);

WithNode.prototype.render = function(context){
    var self = this;

    var values = {};
    Object.entries(this.extra_context).forEach(function(entry){
        values[entry[0]] = entry[1].resolve(context);
    });

    return context.push(values, function(){
        return self.nodelist.render(context);
    });
}

defaultTemplateLibrary.tag('autoescape', function(parser, token){
    /*
        Force autoescape behavior for this block.
    */

    var args = token.contents.split(/\s+/);
    if (args.length != 2){
        throw new TemplateSyntaxError("'autoescape' tag requires exactly one argument.");
    }

    var arg = args[1];
    if (['on', 'off'].indexOf(arg) === -1){
        throw new TemplateSyntaxError("'autoescape' argument should be 'on' or 'off'");
    }

    var nodelist = parser.parse(['endautoescape']);
    parser.deleteFirstToken();

    return new AutoEscapeControlNode(arg === 'on', nodelist);
});

defaultTemplateLibrary.tag('comment', function(parser, token){
    // Ignore everything between ``{% comment %}`` and ``{% endcomment %}``.

    parser.skipPast('endcomment');
    return new CommentNode()
});


defaultTemplateLibrary.tag('cycle', function(parser, token){
    /*
    Cycle among the given strings each time this tag is encountered.

    Within a loop, cycles among the given strings each time through
    the loop::

        {% for o in some_list %}
            <tr class="{% cycle 'row1' 'row2' %}">
                ...
            </tr>
        {% endfor %}

    Outside of a loop, give the values a unique name the first time you call
    it, then use that name each successive time through::

            <tr class="{% cycle 'row1' 'row2' 'row3' as rowcolors %}">...</tr>
            <tr class="{% cycle rowcolors %}">...</tr>
            <tr class="{% cycle rowcolors %}">...</tr>

    You can use any number of values, separated by spaces. Commas can also
    be used to separate values; if a comma is used, the cycle values are
    interpreted as literal strings.

    The optional flag "silent" can be used to prevent the cycle declaration
    from returning any value::

        {% for o in some_list %}
            {% cycle 'row1' 'row2' as rowcolors silent %}
            <tr class="{{ rowcolors }}">{% include "subtemplate.html " %}</tr>
        {% endfor %}
    */
    // Note: This returns the exact same node on each {% cycle name %} call;
    // that is, the node object returned from {% cycle a b c as name %} and the
    // one returned from {% cycle name %} are the exact same object. This
    // shouldn't cause problems (heh), but if it does, now you know.
    //
    // Ugly hack warning: This stuffs the named template dict into parser so
    // that names are only unique within each template (as opposed to using
    // a global variable, which would make cycle names have to be unique across
    // *all* templates.
    //
    // It keeps the last node in the parser to be able to reset it with
    // {% resetcycle %}.

    var name, values, silent, node;
    var args = token.splitContents()

    if (args.length < 2) {
        throw new TemplateSyntaxError("'cycle' tag requires at least two arguments")
    }

    if (args.length === 2) {
        // {% cycle foo %} case.
        name = args[1];
        if (parser._named_cycle_nodes === undefined){
            throw new TemplateSyntaxError("No named cycles in template. '" + name + "' is not defined");
        }

        if (!parser._named_cycle_nodes.hasOwnProperty(name)){
            throw new TemplateSyntaxError("Named cycle '" + name +"' does not exist" );
        }
        return parser._named_cycle_nodes[name];
    }

    var as_form = false;

    if (args.length > 4){
        // {% cycle ... as foo [silent] %} case.
        if (args[args.length-3] === "as"){
            if (args[args.length-1] !== "silent"){
                throw new TemplateSyntaxError("Only 'silent' flag is allowed after cycle's name, not '%s'." % args[-1])
            }

            as_form = true;
            silent = true;
            args = args.slice(0, args.length-1);
        } else if (args[args.length-2] === "as"){
            as_form = true;
            silent = false;
        }
    }

    if (as_form){
        name = args[args.length-1];
        values = args.slice(1, args.length-2).map(function(arg){
            return parser.compileFilter(arg);
        });

        node = new CycleNode(values, name, silent)
        if (parser._named_cycle_nodes === undefined){
            parser._named_cycle_nodes = {}
        }
        parser._named_cycle_nodes[name] = node
    } else {
        values = args.slice(1).map(function(arg){
            return parser.compileFilter(arg);
        });

        node = new CycleNode(values)
    }

    parser._last_cycle_node = node;
    return node
})

defaultTemplateLibrary.tag('debug', function(parser, token){
    /*
    Output a whole load of debugging information, including the current
    context and imported modules.

    Sample usage::

        <pre>
            {% debug %}
        </pre>
    */
    return new DebugNode()
});


defaultTemplateLibrary.tag('filter', function(parser, token){
    /*
    Filter the contents of the block through variable filters.

    Filters can also be piped through each other, and they can have
    arguments -- just like in variable syntax.

    Sample usage::

        {% filter force_escape|lower %}
            This text will be HTML-escaped, and will appear in lowercase.
        {% endfilter %}

    Note that the ``escape`` and ``safe`` filters are not acceptable arguments.
    Instead, use the ``autoescape`` tag to manage autoescaping for blocks of
    template code.
    */

    // token.splitContents() isn't useful here because this tag doesn't accept variable as arguments
    var rest = /\s+(.+)/g.exec(token.contents.trim())[1];
    var filter_expr = parser.compileFilter("var|" + rest);

    filter_expr.filters.foreach(function(filterParams){
        var func = filterParams[0];

        var filter_name = func._filter_name || null;
        if (filter_name === 'escape' ||  filter_name === 'safe'){
            throw new TemplateSyntaxError('"filter ' + filter_name + '" is not permitted.  Use the "autoescape" tag instead.')
        }
    });

    var nodelist = parser.parse(['endfilter'])
    parser.deleteFirstToken();

    return new FilterNode(filter_expr, nodelist);
});


defaultTemplateLibrary.tag("firstof", function(parser, token){
    /*
    Output the first variable passed that is not false.

    Output nothing if all the passed variables are false.

    Sample usage::

        {% firstof var1 var2 var3 as myvar %}

    This is equivalent to::

        {% if var1 %}
            {{ var1 }}
        {% elif var2 %}
            {{ var2 }}
        {% elif var3 %}
            {{ var3 }}
        {% endif %}

    but obviously much cleaner!

    You can also use a literal string as a fallback value in case all
    passed variables are false::

        {% firstof var1 var2 var3 "fallback value" %}

    If you want to disable auto-escaping of variables you can use::

        {% autoescape off %}
            {% firstof var1 var2 var3 "<strong>fallback value</strong>" %}
        {% autoescape %}

    Or if only some variables should be escaped, you can use::

        {% firstof var1 var2|safe var3 "<strong>fallback value</strong>"|safe %}
    */

    var bits = token.splitContents().slice(1);
    var asvar = null;

    if (bits.length === 0){
        throw new TemplateSyntaxError("'firstof' statement requires at least one argument")
    }

    if (bits.length >= 2 && bits[bits.length-2] === 'as'){
        asvar = bits[bits.length-1];
        bits = bits.slice(0, bits.length-2);
    }

    return new FirstOfNode(bits.map(function(bit){
        return parser.compileFilter(bit);
    }), asvar);
});


defaultTemplateLibrary.tag('for', function(parser, token){
    /*
    Loop over each item in an array.

    For example, to display a list of athletes given ``athlete_list``::

        <ul>
        {% for athlete in athlete_list %}
            <li>{{ athlete.name }}</li>
        {% endfor %}
        </ul>

    You can loop over a list in reverse by using
    ``{% for obj in list reversed %}``.

    You can also unpack multiple values from a two-dimensional array::

        {% for key,value in dict.items %}
            {{ key }}: {{ value }}
        {% endfor %}

    The ``for`` tag can take an optional ``{% empty %}`` clause that will
    be displayed if the given array is empty or could not be found::

        <ul>
          {% for athlete in athlete_list %}
            <li>{{ athlete.name }}</li>
          {% empty %}
            <li>Sorry, no athletes in this list.</li>
          {% endfor %}
        <ul>

    The above is equivalent to -- but shorter, cleaner, and possibly faster
    than -- the following::

        <ul>
          {% if athlete_list %}
            {% for athlete in athlete_list %}
              <li>{{ athlete.name }}</li>
            {% endfor %}
          {% else %}
            <li>Sorry, no athletes in this list.</li>
          {% endif %}
        </ul>

    The for loop sets a number of variables available within the loop:

        ==========================  ================================================
        Variable                    Description
        ==========================  ================================================
        ``forloop.counter``         The current iteration of the loop (1-indexed)
        ``forloop.counter0``        The current iteration of the loop (0-indexed)
        ``forloop.revcounter``      The number of iterations from the end of the
                                    loop (1-indexed)
        ``forloop.revcounter0``     The number of iterations from the end of the
                                    loop (0-indexed)
        ``forloop.first``           true if this is the first time through the loop
        ``forloop.last``            true if this is the last time through the loop
        ``forloop.parentloop``      For nested loops, this is the loop "above" the
                                    current one
        ==========================  ================================================
    */

    var in_index, nodelist_empty;

    var bits = token.splitContents()
    if (bits.length < 4){
        throw new TemplateSyntaxError("'for' statements should have at least four words: " + token.contents);
    }

    var is_reversed = bits[bits.length-1] === 'reversed';
    if (is_reversed){
        in_index = bits.length-3;
    } else {
        in_index = bits.length-2;
    }

    if (bits[in_index] !== 'in'){
        throw new TemplateSyntaxError("'for' statements should use the format 'for x in y': " + token.contents);
    }

    var invalid_chars = [' ', '"', "'", FILTER_SEPARATOR];
    var invalid_chars_re = new RegExp('[' + invalid_chars.map(escapeRe).join("") + ']');

    var loopvars = bits.slice(1, in_index).join(' ').split(/ *, */);
    loopvars.forEach(function(loopvarname){
        if (loopvarname === '' || invalid_chars_re.test(loopvarname)){
            throw new TemplateSyntaxError("'for' tag received an invalid argument: " + token.contents)
        }
    });

    var sequence = parser.compileFilter(bits[in_index + 1]);
    var nodelist_loop = parser.parse(['empty', 'endfor']);
    var token = parser.nextToken();

    if (token.contents === 'empty'){
        nodelist_empty = parser.parse(['endfor']);
        parser.deleteFirstToken();
    } else {
        nodelist_empty = null;
    }

    return new ForNode(loopvars, sequence, is_reversed, nodelist_loop, nodelist_empty);
});

var do_ifequal = function(parser, token, negate){
    var nodelist_true, nodelist_false;

    var bits = token.splitContents();

    if (bits.length != 3){
        throw new TemplateSyntaxError(bits[0] + " takes two arguments")
    }

    var end_tag = 'end' + bits[0];

    nodelist_true = parser.parse(['else', end_tag]);
    var token = parser.nextToken();

    if (token.contents === 'else'){
        nodelist_false = parser.parse([end_tag])
        parser.deleteFirstToken()
    } else {
        nodelist_false = new NodeList();
    }

    var val1 = parser.compileFilter(bits[1]);
    var val2 = parser.compileFilter(bits[2]);
    return new IfEqualNode(val1, val2, nodelist_true, nodelist_false, negate)
}

defaultTemplateLibrary.tag('ifequal', function(parser, token){
    /*
    Output the contents of the block if the two arguments equal each other.

    Examples::

        {% ifequal user.id comment.user_id %}
            ...
        {% endifequal %}

        {% ifnotequal user.id comment.user_id %}
            ...
        {% else %}
            ...
        {% endifnotequal %}
    */
    return do_ifequal(parser, token, false);
});

defaultTemplateLibrary.tag('ifnotequal', function(parser, token){
    /*
    Output the contents of the block if the two arguments are not equal.
    See ifequal.
    */
    return do_ifequal(parser, token, true);
});


var TemplateLiteral = function(value, text){
    this.text = text  // for better error messages
    
    TemplateLiteral.baseConstructor.call(this, value);
    this.value = value;
}

inherits(TemplateLiteral, Literal);

TemplateLiteral.prototype.display = function(){
    return this.text
}

TemplateLiteral.prototype.evaluate = function(context){
    return this.value.resolve(context, {ignore_failures: true})
}


var TemplateIfParser = function(parser, tokens){
    this.template_parser = parser;
    TemplateIfParser.baseConstructor.call(this, tokens);
}

inherits(TemplateIfParser, IfParser);

TemplateIfParser.prototype.createVar = function(value){
    return new TemplateLiteral(this.template_parser.compileFilter(value), value)
}


defaultTemplateLibrary.tag('if', function(parser, token){
    /*
    evaluate a variable, and if that variable is "true" (i.e., exists, is not
    empty, and is not a false boolean value), output the contents of the block:

    ::

        {% if athlete_list %}
            Number of athletes: {{ athlete_list|count }}
        {% elif athlete_in_locker_room_list %}
            Athletes should be out of the locker room soon!
        {% else %}
            No athletes.
        {% endif %}

    In the above, if ``athlete_list`` is not empty, the number of athletes will
    be displayed by the ``{{ athlete_list|count }}`` variable.

    The ``if`` tag may take one or several `` {% elif %}`` clauses, as well as
    an ``{% else %}`` clause that will be displayed if all previous conditions
    fail. These clauses are optional.

    ``if`` tags may use ``or``, ``and`` or ``not`` to test a number of
    variables or to negate a given variable::

        {% if not athlete_list %}
            There are no athletes.
        {% endif %}

        {% if athlete_list or coach_list %}
            There are some athletes or some coaches.
        {% endif %}

        {% if athlete_list and coach_list %}
            Both athletes and coaches are available.
        {% endif %}

        {% if not athlete_list or coach_list %}
            There are no athletes, or there are some coaches.
        {% endif %}

        {% if athlete_list and not coach_list %}
            There are some athletes and absolutely no coaches.
        {% endif %}

    Comparison operators are also available, and the use of filters is also
    allowed, for example::

        {% if articles|length >= 5 %}...{% endif %}

    Arguments and operators _must_ have a space between them, so
    ``{% if 1>2 %}`` is not a valid if tag.

    All supported operators are: ``or``, ``and``, ``in``, ``not in``
    ``==``, ``!=``, ``>``, ``>=``, ``<`` and ``<=``.

    Operator precedence follows Python.
    */

    // {% if ... %}

    var bits = token.splitContents().slice(1);
    var condition = (new TemplateIfParser(parser, bits)).parse();
    var nodelist = parser.parse(['elif', 'else', 'endif']);
    var conditions_nodelists = [[condition, nodelist]];

    var token = parser.nextToken();

    // {% elif ... %} (repeatable)
    while (token.contents.startsWith('elif')){
        bits = token.splitContents().slice(1);
        condition = (new TemplateIfParser(parser, bits)).parse();
        nodelist = parser.parse(['elif', 'else', 'endif']);
        conditions_nodelists.push([condition, nodelist])
        token = parser.nextToken();
    }

    // {% else %} (optional)
    if (token.contents === 'else'){
        nodelist = parser.parse(['endif']);

        conditions_nodelists.push([null, nodelist])
        token = parser.nextToken()
    }

    // {% endif %}
    if (token.contents !== 'endif'){
        throw new TemplateSyntaxError('Malformed template tag at line ' + token.lineno + ': "' + token.contents + '"');
    }

    return new IfNode(conditions_nodelists);
});


defaultTemplateLibrary.tag('ifchanged', function(parser, token){
    /*
    Check if a value has changed from the last iteration of a loop.

    The ``{% ifchanged %}`` block tag is used within a loop. It has two
    possible uses.

    1. Check its own rendered contents against its previous state and only
       displays the content if it has changed. For example, this displays a
       list of days, only displaying the month if it changes::

            <h1>Archive for {{ year }}</h1>

            {% for date in days %}
                {% ifchanged %}<h3>{{ date|date:"F" }}</h3>{% endifchanged %}
                <a href="{{ date|date:"M/d"|lower }}/">{{ date|date:"j" }}</a>
            {% endfor %}

    2. If given one or more variables, check whether any variable has changed.
       For example, the following shows the date every time it changes, while
       showing the hour if either the hour or the date has changed::

            {% for date in days %}
                {% ifchanged date.date %} {{ date.date }} {% endifchanged %}
                {% ifchanged date.hour date.date %}
                    {{ date.hour }}
                {% endifchanged %}
            {% endfor %}
    */
    var nodelist_true, nodelist_false;

    var bits = token.splitContents();
    nodelist_true = parser.parse(['else', 'endifchanged']);

    var token = parser.nextToken();

    if (token.contents === 'else'){
        nodelist_false = parser.parse(['endifchanged']);
        parser.deleteFirstToken();
    } else {
        nodelist_false = new NodeList();
    }
    var values = bits.slice(1).map(function(bit){
        return parser.compileFilter(bit)
    });

    return new IfChangedNode(nodelist_true, nodelist_false, ...values);
});


var findLibrary = function(parser, name){
    if (parser.libraries[name] !== undefined){
        return parser.libraries[name]
    } else {
        var registeredLibraryNames = Object.keys(parser.libraries);
        
        if (registeredLibraryNames.length === 0){
           throw new TemplateSyntaxError(
                "Not possible to load '" + name + "'. No registered library yet."
            );
        } else {
            throw new TemplateSyntaxError(
                "'" + name + "' is not a registered tag library. Must be one of: " + registeredLibraryNames.sort().join(", ")
            );
        }
    }
}

var loadFromLibrary = function(library, label, names){
    /*
    Return a subset of tags and filters from a library.
    */
    var subset = new Library();

    names.forEach(function(name){
        var found = false

        if (library.tags.hasOwnProperty(name)){
            found = true
            subset.tags[name] = library.tags[name]
        }

        if (library.filters.hasOwnProperty(name)){
            found = true;
            subset.filters[name] = library.filters[name];
        }

        if (!found){
            throw new TemplateSyntaxError("'" + name + "' is not a valid tag or filter in tag library '" + label + "'");
        }
    });

    return subset
}

defaultTemplateLibrary.tag('load', function(parser, token){
    /*
    Load a custom template tag library into the parser.

    For example, to load the template tags in
    ``django/templatetags/news/photos.py``::

        {% load news.photos %}

    Can also be used to load an individual tag/filter from
    a library::

        {% load byline from news %}
    */

    // token.splitContents() isn't useful here because this tag doesn't accept variable as arguments
    var bits = token.contents.split(/\s+/);

    if (bits.length >= 4 && bits[bits.length-2] === "from"){
        // from syntax is used; load individual tags from the library
        var name = bits[bits.length-1];
        var lib = findLibrary(parser, name)
        var subset = loadFromLibrary(lib, name, bits.slice(1, bits.length-2));

        parser.addLibrary(subset)
    } else {
        // one or more libraries are specified; load and add them to the parser
        bits.slice(1).forEach(function(name){
            var lib = findLibrary(parser, name)
            parser.addLibrary(lib)
        });
    }

    return new LoadNode()
});


defaultTemplateLibrary.tag('lorem', function(parser, token){
    /*
    Create random Latin text useful for providing test data in templates.

    Usage format::

        {% lorem [count] [method] [random] %}

    ``count`` is a number (or variable) containing the number of paragraphs or
    words to generate (default is 1).

    ``method`` is either ``w`` for words, ``p`` for HTML paragraphs, ``b`` for
    plain-text paragraph blocks (default is ``b``).

    ``random`` is the word ``random``, which if given, does not use the common
    paragraph (starting "Lorem ipsum dolor sit amet, consectetuer...").

    Examples:

    * ``{% lorem %}`` outputs the common "lorem ipsum" paragraph
    * ``{% lorem 3 p %}`` outputs the common "lorem ipsum" paragraph
      and two random paragraphs each wrapped in HTML ``<p>`` tags
    * ``{% lorem 2 w random %}`` outputs two random latin words
    */
    var method, count;

    var bits = token.splitContents();
    var tagname = bits[0];

    // Random bit
    var common = bits[bits.length-1] !== 'random';

    if (!common){
        bits.pop();
    }

    // Method bit
    if (['w', 'p', 'b'].indexOf(bits[bits.length-1]) !== -1){
        method = bits.pop()
    } else {
        method = 'b';
    }

    // Count bit
    if (bits.length > 1){
        count = bits.pop()
    } else {
        count = '1';
    }

    count = parser.compileFilter(count);

    if (bits.length != 1){
        throw new TemplateSyntaxError("Incorrect format for " + tagname + " tag")
    }

    return new LoremNode(count, method, common);
});


defaultTemplateLibrary.tag('now', function(parser, token){
    /*
    Display the date, formatted according to the given string.

    Use the same format as PHP's ``date()`` function; see https://php.net/date
    for all the possible values.

    Sample usage::

        It is {% now "jS F Y H:i" %}
    */
    var bits = token.splitContents();
    var asvar = null;

    if (bits.length === 4 && bits[bits.length-2] === 'as'){
        asvar = bits[bits.length-1];
        bits = bits.slice(0, bits.length-2);
    }

    if (bits.length !== 2){
        throw new TemplateSyntaxError("'now' statement takes one argument");
    }

    var format_string = bits[1].slice(1, bits[1].length-1);
    return new NowNode(format_string, asvar);
});


defaultTemplateLibrary.tag('regroup', function(parser, token){
    /*
    Regroup a list of alike objects by a common attribute.

    This complex tag is best illustrated by use of an example: say that
    ``musicians`` is a list of ``Musician`` objects that have ``name`` and
    ``instrument`` attributes, and you'd like to display a list that
    looks like:

        * Guitar:
            * Django Reinhardt
            * Emily Remler
        * Piano:
            * Lovie Austin
            * Bud Powell
        * Trumpet:
            * Duke Ellington

    The following snippet of template code would accomplish this dubious task::

        {% regroup musicians by instrument as grouped %}
        <ul>
        {% for group in grouped %}
            <li>{{ group.grouper }}
            <ul>
                {% for musician in group.list %}
                <li>{{ musician.name }}</li>
                {% endfor %}
            </ul>
        {% endfor %}
        </ul>

    As you can see, ``{% regroup %}`` populates a variable with a list of
    objects with ``grouper`` and ``list`` attributes. ``grouper`` contains the
    item that was grouped by; ``list`` contains the list of objects that share
    that ``grouper``. In this case, ``grouper`` would be ``Guitar``, ``Piano``
    and ``Trumpet``, and ``list`` is the list of musicians who play this
    instrument.

    Note that ``{% regroup %}`` does not work when the list to be grouped is not
    sorted by the key you are grouping by! This means that if your list of
    musicians was not sorted by instrument, you'd need to make sure it is sorted
    before using it, i.e.::

        {% regroup musicians|dictsort:"instrument" by instrument as grouped %}
    */
    var bits = token.splitContents();

    if (bits.length != 6){
        throw new TemplateSyntaxError("'regroup' tag takes five arguments");
    }

    var target = parser.compileFilter(bits[1]);
    if (bits[2] !== 'by'){
        throw new TemplateSyntaxError("second argument to 'regroup' tag must be 'by'");
    }

    if (bits[4] !== 'as'){
        throw new TemplateSyntaxError("next-to-last argument to 'regroup' tag must be 'as'");
    }

    var var_name = bits[5];

    // RegroupNode will take each item in 'target', put it in the context under
    // 'var_name', evaluate 'var_name'.'expression' in the current context, and
    // group by the resulting value. After all items are processed, it will
    // save the final result in the context under 'var_name', thus clearing the
    // temporary values. This hack is necessary because the template engine
    // doesn't provide a context-aware equivalent of Python's getattr.
    var expression = parser.compileFilter(var_name +
                                       VARIABLE_ATTRIBUTE_SEPARATOR +
                                       bits[3]);

    return new RegroupNode(target, expression, var_name)
});

defaultTemplateLibrary.tag('resetcycle', function(parser, token){
    /*
    Reset a cycle tag.

    If an argument is given, reset the last rendered cycle tag whose name
    matches the argument, else reset the last rendered cycle tag (named or
    unnamed).
    */

    var args = token.splitContents();

    if (args.length > 2){
        throw new TemplateSyntaxError(args[0] + " tag accepts at most one argument.");
    }

    if (args.length === 2){
        var name = args[1];
        if (!parser.hasOwnProperty("_named_cycle_nodes") || parser._named_cycle_nodes[name] === undefined){
            throw new TemplateSyntaxError("Named cycle '" + name +"' does not exist.");
        }
        return new ResetCycleNode(parser._named_cycle_nodes[name]);            
    }

    if (!parser.hasOwnProperty("_last_cycle_node")){
        throw new TemplateSyntaxError("No cycles in template.")
    }

    return new ResetCycleNode(parser._last_cycle_node)
});


defaultTemplateLibrary.tag('spaceless', function(parser, token){
    /*
    Remove whitespace between HTML tags, including tab and newline characters.

    Example usage::

        {% spaceless %}
            <p>
                <a href="foo/">Foo</a>
            </p>
        {% endspaceless %}

    This example returns this HTML::

        <p><a href="foo/">Foo</a></p>

    Only space between *tags* is normalized -- not space between tags and text.
    In this example, the space around ``Hello`` isn't stripped::

        {% spaceless %}
            <strong>
                Hello
            </strong>
        {% endspaceless %}
    */

    var nodelist = parser.parse(['endspaceless']);
    parser.deleteFirstToken();

    return new SpacelessNode(nodelist)
});


defaultTemplateLibrary.tag('templatetag', function(parser, token){
    /*
    Output one of the bits used to compose template tags.

    Since the template system has no concept of "escaping", to display one of
    the bits used in template tags, you must use the ``{% templatetag %}`` tag.

    The argument tells which template bit to output:

        ==================  =======
        Argument            Outputs
        ==================  =======
        ``openblock``       ``{%``
        ``closeblock``      ``%}``
        ``openvariable``    ``{{``
        ``closevariable``   ``}}``
        ``openbrace``       ``{``
        ``closebrace``      ``}``
        ``opencomment``     ``{#``
        ``closecomment``    ``#}``
        ==================  =======
    */
    // token.splitContents() isn't useful here because this tag doesn't accept variable as arguments
    var bits = token.contents.split(/\s+/);
    if (bits.length !== 2){
        throw new TemplateSyntaxError("'templatetag' statement takes one argument");
    }

    var tag = bits[1];
    if (!TemplateTagNode.mapping.hasOwnProperty(tag)){
        throw new TemplateSyntaxError("Invalid templatetag argument: '" + tag + "'. Must be one of: " + Object.keys(TemplateTagNode.mapping).join(', '));
    }

    return new TemplateTagNode(tag);
});


defaultTemplateLibrary.tag('verbatim', function(parser, token){
    /*
    Stop the template engine from rendering the contents of this block tag.

    Usage::

        {% verbatim %}
            {% don't process this %}
        {% endverbatim %}

    You can also designate a specific closing tag block (allowing the
    unrendered use of ``{% endverbatim %}``)::

        {% verbatim myblock %}
            ...
        {% endverbatim myblock %}
    */
    var nodelist = parser.parse(['endverbatim']);
    parser.deleteFirstToken();

    return new VerbatimNode(nodelist.render(new Context()));
});


defaultTemplateLibrary.tag('widthratio', function(parser, token){
    /*
    For creating bar charts and such. Calculate the ratio of a given value to a
    maximum value, and then apply that ratio to a constant.

    For example::

        <img src="bar.png" alt="Bar"
             height="10" width="{% widthratio this_value max_value max_width %}">

    If ``this_value`` is 175, ``max_value`` is 200, and ``max_width`` is 100,
    the image in the above example will be 88 pixels wide
    (because 175/200 = .875; .875 * 100 = 87.5 which is rounded up to 88).

    In some cases you might want to capture the result of widthratio in a
    variable. It can be useful for instance in a blocktrans like this::

        {% widthratio this_value max_value max_width as width %}
        {% blocktrans %}The width is: {{ width }}{% endblocktrans %}
    */
    var tag, this_value_expr, max_value_expr, max_width, as_, asvar;

    var bits = token.splitContents();
    if (bits.length === 4){
        tag = bits[0];
        this_value_expr = bits[1];
        max_value_expr = bits[2];
        max_width = bits[3];

        asvar = null
    } else if (bits.length === 6){
        tag = bits[0];
        this_value_expr = bits[1];
        max_value_expr = bits[2];
        max_width = bits[3];
        as_ = bits[4];
        asvar = bits[5];

        if (as_ !== 'as'){
            throw new TemplateSyntaxError("Invalid syntax in widthratio tag. Expecting 'as' keyword");
        }
    } else {
        throw new TemplateSyntaxError("widthratio takes at least three arguments")
    }

    return new WidthRatioNode(parser.compileFilter(this_value_expr),
                          parser.compileFilter(max_value_expr),
                          parser.compileFilter(max_width),
                          asvar)
});

defaultTemplateLibrary.tag('with', function(parser, token){
    /*
    Add one or more values to the context (inside of this block) for caching
    and easy access.

    For example::

        {% with total=person.some_sql_method %}
            {{ total }} object{{ total|pluralize }}
        {% endwith %}

    Multiple values can be added to the context::

        {% with foo=1 bar=2 %}
            ...
        {% endwith %}

    The legacy format of ``{% with person.some_sql_method as total %}`` is
    still accepted.
    */

    var bits = token.splitContents();
    var remaining_bits = bits.slice(1);

    // support_legacy: true
    var extra_context = token_kwargs(remaining_bits, parser, true);
    if (Object.keys(extra_context).length === 0){
        throw new TemplateSyntaxError(bits[0] + " expected at least one variable assignment")
    }

    if (remaining_bits.length !== 0){
        throw new TemplateSyntaxError(bits[0] + " received an invalid token: " + remaining_bits[0]);
    }

    var nodelist = parser.parse(['endwith']);
    parser.deleteFirstToken();

    return new WithNode(null, null, nodelist, extra_context);
});

TemplateEngine.TemplateError = TemplateError;
TemplateEngine.TemplateSyntaxError = TemplateSyntaxError;
TemplateEngine.TemplateDoesNotExistError = TemplateDoesNotExistError;

global.DjangoTemplateEngine = TemplateEngine;

})(this);
