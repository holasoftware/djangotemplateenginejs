var patch_date_object = function(f){
    var oldDate = Date;
    Date = function(){
        this.t = new oldDate(0);
    }
    Object.getOwnPropertyNames(oldDate.prototype).forEach(function(propName){
        if (propName === 'constructor') return;
        
        Date.prototype[propName] = function(){
            return this.t[propName].apply(this.t, arguments);
        }    
    });
    Date.name = oldDate.name;
    Date.now = oldDate.now;
    Date.parse = oldDate.parse;
    Date.UTC = oldDate.UTC;

    f(function(){
        Date = oldDate;
    });
}

QUnit.test( "Template does not exist", function( assert ) {
    assert.throws( function(){
        var engine = new DjangoTemplateEngine();
        engine.renderToString("test0");
    }, "Template 'test0' does not exist" );
});

QUnit.test( "Variable containing simple value", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{var1}}", {"var1": 4});
    assert.equal( rendered_template, "4" );
});


QUnit.test( "Variable containing html", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{var1}}", {"var1": '<span>inside span</span>'});
    assert.equal( rendered_template, "&lt;span&gt;inside span&lt;/span&gt;" );
});


QUnit.test( "Variable containing nested dictionaries", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{varname.level1.level2.value}}", {"varname": {"level1": {"level2": {"value": "data"}}}});
    assert.equal( rendered_template, "data" );
});


QUnit.test( "Variable does not exists", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{this_var_does_not_exist}}");
    assert.equal( rendered_template, "" );
});

QUnit.test( "Variable does not exists, return option 'string_if_invalid'", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{this_var_does_not_exist}}", null, null, {
        string_if_invalid: 'invalid string'
    });
    assert.equal( rendered_template, 'invalid string' );
});

QUnit.test( "Template mixing variables and texts1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("text1.. {{var1}} text2.. {{var2}} text3.. {{var3}}", {"var1": "variable_value1", "var2": "variable_value2", "var3": "variable_value3"});
    assert.equal( rendered_template, 'text1.. variable_value1 text2.. variable_value2 text3.. variable_value3' );
});


QUnit.test( "Template mixing variables and texts2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("My name is {{account.name}} and I am {{account.age}} years old", {"account": {"name": "Robert", "age": 25}});
    assert.equal( rendered_template, 'My name is Robert and I am 25 years old' );
});

QUnit.test( "Comment", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{# This is a comment #}");

    assert.equal( rendered_template, '');
});

QUnit.test( "Include tag only text", function( assert ) {
    var engine = new DjangoTemplateEngine({
        "included_template": "This is included",
        "base_template": "Testing including another template {% include 'included_template' %}. More here"});
    var rendered_template = engine.renderToString("base_template");

    assert.equal( rendered_template, 'Testing including another template This is included. More here' );
});

QUnit.test( "Include tag with text 2 times", function( assert ) {
    var engine = new DjangoTemplateEngine({"included_template1": "This text is included in another template and a second template '{% include 'included_template2' %}' is also included",
    "included_template2": "This is included", 
    "base_template": "Testing including this: {% include 'included_template1' %}. More text here"});
    var rendered_template = engine.renderToString("base_template");

    assert.equal( rendered_template, "Testing including this: This text is included in another template and a second template 'This is included' is also included. More text here" );
});

QUnit.test( "Include tag with variable inside", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("Testing including another template {% include 'included_template' %}. More here", {
        'var': 'value'
    }, {
        "included_template": "This is var included: {{ var }}"
    });

    assert.equal( rendered_template, 'Testing including another template This is var included: value. More here' );
});

QUnit.test( "Include tag 2 times with variables inside", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("Testing include tag with vars inside: {% include 'included_template1' %}. More text here...", {
        'var1': 'value1',
        'var2': 'value2',
        'var3': 'value3',
        'var4': 'value4',
        'var5': 'value5'
    }, {
        "included_template1": "Var1 {{ var1 }} {% include 'included_template2' %} Var4 {{ var4 }} Var5 {{ var5 }}",
        "included_template2": "Var2 {{ var2 }} Var3 {{ var3 }}"
    });

    assert.equal( rendered_template, 'Testing include tag with vars inside: Var1 value1 Var2 value2 Var3 value3 Var4 value4 Var5 value5. More text here...' );
});

QUnit.test( "Extends tag empty block", function( assert ) {
    var engine = new DjangoTemplateEngine({
        "base": "document extended {% block content %}{% endblock %} text from the base template at the footer",
        "main_template": "{% extends 'base' %} {% block content %}text here...{% endblock %}"});
    var rendered_template = engine.renderToString("main_template");

    assert.equal( rendered_template, 'document extended text here... text from the base template at the footer' );
});

QUnit.test( "Extends tag block super1", function( assert ) {
    var engine = new DjangoTemplateEngine({
        "base": "{% block content %}base text{% endblock %}",
        "main_template": "{% extends 'base' %}{% block content %}{{ block.super }}{% endblock %}"});
    var rendered_template = engine.renderToString("main_template");

    assert.equal( rendered_template, 'base text' );
});

QUnit.test( "Extends tag block super2", function( assert ) {
    var engine = new DjangoTemplateEngine({
        "base": "{% block content %}base text{% endblock %}",
        "main_template": "{% extends 'base' %}{% block content %}extra text... {{ block.super }}. end of block{% endblock %}"});
    var rendered_template = engine.renderToString("main_template");

    assert.equal( rendered_template, 'extra text... base text. end of block' );
});

QUnit.test( "Extends tag 2 times1", function( assert ) {
    var engine = new DjangoTemplateEngine({
        "base1": "<header>{% block header %}{% endblock %}</header><body>{% block body %}{% endblock %}</body>",
        "base2": "{% extends 'base1' %} {% block body %}text here...{% endblock %}",
        "main_template": "{% extends 'base2' %}{% block header %}this is the header{% endblock %}  {% block body %}other text here...{% endblock %}"     
        });
    var rendered_template = engine.renderToString("main_template");

    assert.equal( rendered_template, '<header>this is the header</header><body>other text here...</body>' );
});

QUnit.test( "Extends tag 2 times2", function( assert ) {
    var engine = new DjangoTemplateEngine({
        "base1": "<header>{% block header %}base header{% endblock %}</header><body>{% block body %}base body{% endblock %}</body>",
        "base2": "{% extends 'base1' %} {% block body %}{{ block.super }}...text here...{% endblock %}",
        "main_template": "{% extends 'base2' %}{% block header %}{{ block.super }}...adding more header{% endblock %}  {% block body %}{{ block.super }}more text here...{% endblock %}"     
        });
    var rendered_template = engine.renderToString("main_template");

    assert.equal( rendered_template, '<header>base header...adding more header</header><body>base body...text here...more text here...</body>' );
});

QUnit.test( "Extends with variables inside1", function( assert ) {
    var engine = new DjangoTemplateEngine({"base": "variable1 {{var1}} {% block content %}{% endblock %}", "template": "{% extends 'base' %} {% block content %}variable2 {{var2}}{% endblock %}"});
    var rendered_template = engine.renderToString("template", {"var1": "value1", "var2": "value2"});

    assert.equal( rendered_template, 'variable1 value1 variable2 value2' );
});

QUnit.test( "Extends with variables inside2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% extends 'base' %} {% block content1 %}variable2 {{var2}}{% endblock %} {% block content2 %}another variable {{var3}}{% endblock %}", {
        "var1": "value1",
        "var2": "value2",
        "var3": "value3"
    }, {
        "base": "variable1 {{var1}} {% block content1 %}{% endblock %} another block {% block content2 %}{% endblock %} end."
    });

    assert.equal( rendered_template, "variable1 value1 variable2 value2 another block another variable value3 end." );
});

QUnit.test( "Extend and Include tag", function( assert ) {
    var engine = new DjangoTemplateEngine({
        "base": "variable1 {{var1}} {% block content %}{% endblock %} included text '{% include 'included_template' %}' variable5 {{var5}}",
        "included_template": "variable3 {{var3}} variable4 {{var4}}",
        "main_template": "{% extends 'base' %} {% block content %}variable2 {{var2}}{% endblock %}"});
    var rendered_template = engine.renderToString("main_template", {"var1": "value1", "var2": "value2", "var3": "value3", "var4": "value4", "var5": "value5"});

    assert.equal( rendered_template, "variable1 value1 variable2 value2 included text 'variable3 value3 variable4 value4' variable5 value5" );
});

QUnit.test( "If tag", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if True %}it's true{% endif %}");

    assert.equal( rendered_template, "it's true");
});

QUnit.test( "If variable is true", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if var1 %}it's true{% endif %}", {'var1': true});

    assert.equal( rendered_template, "it's true");
});


QUnit.test( "If and operator1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if True and True %}it's true{% endif %}", {'var1': true});

    assert.equal( rendered_template, "it's true");
});

QUnit.test( "If and operator2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if True and False %}it's true{% endif %}", {'var1': true});

    assert.equal( rendered_template, "");
});


QUnit.test( "If and operator3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if condition1 and condition2 %}it's true{% endif %}", {
        condition1: false,
        condition2: true
    });

    assert.equal( rendered_template, "");
});


QUnit.test( "If or operator1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if True or True %}it's true{% endif %}", {'var1': true});

    assert.equal( rendered_template, "it's true");
});

QUnit.test( "If or operator2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if False or False %}it's true{% endif %}", {'var1': true});

    assert.equal( rendered_template, "");
});

QUnit.test( "If or operator3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if condition1 or condition2 %}it's true{% endif %}", {
        condition1: false,
        condition2: true
    });

    assert.equal( rendered_template, "it's true");
});


QUnit.test( "If == operator", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if '0' == 0 %}it's true{% endif %}");

    assert.equal( rendered_template, "it's true");
});

QUnit.test( "If '0' === 0", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if '0' === 0 %}it's true{% endif %}");

    assert.equal( rendered_template, "");
});

QUnit.test( "If 0 === 0", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if 0 === 0 %}it's true{% endif %}");

    assert.equal( rendered_template, "it's true");
});

QUnit.test( "If 0 is Number", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if num is Number %}it's true{% endif %}", {'num': new Number(0), 'Number': Number});

    assert.equal( rendered_template, "it's true");
});

QUnit.test( "If multiple and1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if condition1 and condition2 and condition2 %}it's true{% endif %}", {
        condition1: true,
        condition2: true,
        condition3: true
    });

    assert.equal( rendered_template, "it's true");
});


QUnit.test( "If multiple and2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if condition1 and condition2 and condition2 %}it's true{% endif %}", {
        condition1: false,
        condition2: true,
        condition3: true
    });

    assert.equal( rendered_template, "");
});


QUnit.test( "If multiple or1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if condition1 or condition2 or condition2 %}it's true{% endif %}", {
        condition1: false,
        condition2: true,
        condition3: true
    });

    assert.equal( rendered_template, "it's true");
});


QUnit.test( "If multiple or2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if condition1 or condition2 or condition2 %}it's true{% endif %}", {
        condition1: false,
        condition2: false,
        condition3: false
    });

    assert.equal( rendered_template, "");
});


QUnit.test( "If and/or operators1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if condition1 and condition2 or condition3 %}it's true{% endif %}", {
        condition1: false,
        condition2: true,
        condition3: true
    });

    assert.equal( rendered_template, "it's true");
});


QUnit.test( "If and/or operators2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if condition1 or condition2 and condition3 %}it's true{% endif %}", {
        condition1: false,
        condition2: true,
        condition3: true
    });

    assert.equal( rendered_template, "it's true");
});

QUnit.test( "If and/or operators3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if condition1 or condition2 and condition3 %}it's true{% endif %}", {
        condition1: false,
        condition2: true,
        condition3: false
    });

    assert.equal( rendered_template, "");
});

QUnit.test( "If/Else tag", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if False %}it's true{% else %}it's false{% endif %}");
    assert.equal( rendered_template, "it's false");
});

QUnit.test( "If/Elif tag", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if False %}first if{% elif True %}second if{% endif %}");
    assert.equal( rendered_template, "second if");
});

QUnit.test( "If/Elif/Else tag1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if False %}first if{% elif False %}second if{% else %}else clause{% endif %}");
    assert.equal( rendered_template, "else clause");
});

QUnit.test( "If/Elif/Else tag2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if False %}first if{% elif True %}second if{% else %}else clause{% endif %}");
    assert.equal( rendered_template, "second if");
});

QUnit.test( "Ifequal tag1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% ifequal a a %}It's equal{% endifequal %}", {'a': 'value'});
    assert.equal( rendered_template, "It's equal");
});

QUnit.test( "Ifequal tag2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% ifequal a 'value' %}It's equal{% endifequal %}", {'a': 'value'});
    assert.equal( rendered_template, "It's equal");
});

QUnit.test( "Ifnotequal tag1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% ifnotequal a 'value' %}It's not equal{% else %}It's equal{% endifnotequal %}", {'a': 'value'});
    assert.equal( rendered_template, "It's equal");
});

QUnit.test( "Ifnotequal tag2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% ifnotequal a 'another value' %}It's not equal{% endifnotequal %}", {'a': 'value'});
    assert.equal( rendered_template, "It's not equal");
});

QUnit.test( "Invalid tag", function( assert ) {
    assert.throws( function(){
        DjangoTemplateEngine.renderTemplate("{% invalid_tag %}");
    }, new DjangoTemplateEngine.TemplateSyntaxError("Invalid block tag on line 1: 'invalid_tag'. Did you forget to register or load this tag?"));
});

QUnit.test( "Invalid filter", function( assert ) {
    assert.throws( function(){
        DjangoTemplateEngine.renderTemplate("{{ arg|invalid_filter }}");
    }, new DjangoTemplateEngine.TemplateSyntaxError("Invalid filter: 'invalid_filter'"));
});

QUnit.test( "Filter noop", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|noop }}", {"value":"the same value"});

    assert.equal( rendered_template, 'the same value' );
});

QUnit.test( "Filter return_arg1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|return_arg:'test' }}", {"value":"value"});

    assert.equal( rendered_template, 'test' );
});

QUnit.test( "Filter return_arg2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|return_arg:arg }}", {"value":"value", "arg": "some argument"});

    assert.equal( rendered_template, 'some argument' );
});

QUnit.test( "Filter return_arg3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|return_arg:1234 }}", {"value":"value"});

    assert.equal( rendered_template, '1234' );
});


QUnit.test( "Filter cut", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|cut:'a' }}", {"value":"abraacaadraaabraaa"});

    assert.equal( rendered_template, 'brcdrbr' );
});

QUnit.test( "Filter linebreaks", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|linebreaks }}", {"value":"line 1\nline 2\nline 3\n\nNew paragraph"});

    assert.equal( rendered_template, '<p>line 1<br>line 2<br>line 3</p><p>New paragraph</p>' );
});

QUnit.test( "Filter linebreaksbr", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|linebreaksbr }}", {"value":"line 1\nline 2\nline 3"});

    assert.equal( rendered_template, 'line 1<br>line 2<br>line 3' );
});


QUnit.test( "Filter striptags", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|striptags }}", {"value":"<p>paragraph <a href='test.com'>link</a></p>"});

    assert.equal( rendered_template, 'paragraph link' );
});


QUnit.test( "Filter lower", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|lower }}", {"value":"this is a Value"});

    assert.equal( rendered_template, 'this is a value' );
});

QUnit.test( "Filter upper", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|upper }}", {"value":"this is a Value"});

    assert.equal( rendered_template, 'THIS IS A VALUE' );
});

QUnit.test( "Filter capfirst", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|capfirst }}", {"value":"this is a Value"});

    assert.equal( rendered_template, 'This is a Value' );
});

QUnit.test( "Channing lower and capfirst filters", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|lower|capfirst }}", {"value":"this is a Value"});

    assert.equal( rendered_template, 'This is a value' );
});

QUnit.test( "Filter wordcount", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ ' word1 word2 word3 word4 '|wordcount }}");

    assert.equal( rendered_template, '4' );
});


QUnit.test( "Filter ljust", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ 'word'|ljust:10 }}");

    assert.equal( rendered_template, 'word      ' );
});

QUnit.test( "Filter rjust", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ 'word'|rjust:10 }}");

    assert.equal( rendered_template, '      word' );
});

QUnit.test( "Filter center", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|center:20 }}", {"value":"text centered"});

    assert.equal( rendered_template, '   text centered    ' );
});

QUnit.test( "Filter wordwrap", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ text|wordwrap:5 }}", {"text": 'this is wrapped\nline. this is another long line.\nThis is a\nmultiline with several words.'});

    assert.equal( rendered_template, `this
is
wrapped
line.
this
is
another
long
line.
This
is a
multiline
with
several
words.` );
});

QUnit.test( "Filter make_list1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ word|make_list }}", {"word": "abcd"});

    assert.equal( rendered_template, 'a,b,c,d' );
});


QUnit.test( "Filter make_list2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ number|make_list }}", {"number": 1234});

    assert.equal( rendered_template, '1,2,3,4' );
});


QUnit.test( "Filter random", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ my_list|random }}", {"my_list": [1, 2, 3, 4]});

    assert.true( '1234'.indexOf(rendered_template) !== -1);
});

QUnit.test( "Filter iriencode", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ 'this is a path'|iriencode }}");

    assert.equal( rendered_template, 'this%20is%20a%20path' );
});

QUnit.test( "Filter linenumbers", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ text|linenumbers }}", {"text": "one line\n another line\n\nmore lines here...\nand finally this"});

    assert.equal( rendered_template, `1. one line
2.  another line
3. 
4. more lines here...
5. and finally this` );
});


QUnit.test( "Filter truncatechars", function( assert ) {
var rendered_template = DjangoTemplateEngine.renderTemplate("{{ text|truncatechars:27 }}", {'text': 'This is a very long text with many characters.'});

    assert.equal( rendered_template, 'This is a very long text...');
});

QUnit.test( "Filter escapejs", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("escapejs: {{ js|escapejs }}", {"js": 'this is a "string" and this is \'another string\'.  Escaped? \\'});

    assert.equal( rendered_template, 'escapejs: this is a \\u0022string\\u0022 and this is \\u0027another string\\u0027.  Escaped? \\u005C');
});

QUnit.test( "Filter floatformat1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num1|floatformat }}", {'num1': 34.23234});
    assert.equal( rendered_template, '34.2');

    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num2|floatformat }}", {'num2': 34.00000});
    assert.equal( rendered_template, '34');
    
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num3|floatformat }}", {'num3': 34.26000});
    assert.equal( rendered_template, '34.3');
});

QUnit.test( "Filter floatformat2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num1|floatformat:3 }}", {'num1': 34.23234});
    assert.equal( rendered_template, '34.232');

    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num2|floatformat:3 }}", {'num2': 34.00000});
    assert.equal( rendered_template, '34.000');
    
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num3|floatformat:3 }}", {'num3': 34.26000});
    assert.equal( rendered_template, '34.260');
});

QUnit.test( "Filter floatformat3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num1|floatformat:'-3' }}", {'num1': 34.23234});
    assert.equal( rendered_template, '34.232');

    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num2|floatformat:'-3' }}", {'num2': 34.00000});
    assert.equal( rendered_template, '34');
    
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num3|floatformat:'-3' }}", {'num3': 34.26000});
    assert.equal( rendered_template, '34.260');
});


QUnit.test( "Filter slugify", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ text|slugify }}", {'text': 'Title of new post.'});

    assert.equal( rendered_template, 'title-of-new-post');
});


QUnit.test( "Filter title", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ text|title }}", {'text': 'The title of an interesting book'});

    assert.equal( rendered_template, 'The Title Of An Interesting Book');
});

// TODO
/* QUnit.test( "Filter urlize", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ text|urlize }}", {'text': 'The best search engine is https://duckduckgo.com'});

    assert.equal( rendered_template, '');
});
 */

QUnit.test( "Filter safe", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ text|safe }}", {'text': '<script>alert("hola");</script>'});

    assert.equal( rendered_template, '<script>alert("hola");</script>');
});

QUnit.test( "Filter stringformat1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ s|stringformat:'10s' }}", {'s': 'text'});

    assert.equal( rendered_template, "      text");
});


QUnit.test( "Filter stringformat2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ s|stringformat:'-10s' }}", {'s': 'text'});

    assert.equal( rendered_template, "text      ");
});

QUnit.test( "Filter stringformat3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num|stringformat:'b' }}", {'num': 12});

    assert.equal( rendered_template, "1100");
});

QUnit.test( "Filter stringformat4", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num|stringformat:'x' }}", {'num': 12});

    assert.equal( rendered_template, "0c");
});

QUnit.test( "Filter stringformat5", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num|stringformat:'4f' }}", {'num': 12});

    assert.equal( rendered_template, "  12");
});

QUnit.test( "Filter stringformat6", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num|stringformat:'-4f' }}", {'num': 12});

    assert.equal( rendered_template, "12  ");
});


QUnit.test( "Filter stringformat7", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num|stringformat:'.2f' }}", {'num': 5.234});

    assert.equal( rendered_template, "5.23");
});


QUnit.test( "Filter stringformat8", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ num|stringformat:'7.2f' }}", {'num': 5.234});

    assert.equal( rendered_template, "   5.23");
});

QUnit.test( "Filter yesno1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ True|yesno }}");

    assert.equal( rendered_template, "yes");
});

QUnit.test( "Filter yesno2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ False|yesno }}");

    assert.equal( rendered_template, "no");
});

QUnit.test( "Filter yesno3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ var|yesno }}");

    assert.equal( rendered_template, "maybe");
});

QUnit.test( "Filter first", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|first }}", {"value":['first item', 'second item', 'third item']});

    assert.equal( rendered_template, 'first item' );
});

QUnit.test( "Filter last", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|last }}", {"value":['first item', 'second item', 'third item']});

    assert.equal( rendered_template, 'third item' );
});


QUnit.test( "Filter join", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|join:'-' }}", {"value":['first item', 'second item', 'third item']});

    assert.equal( rendered_template, 'first item-second item-third item' );
});

QUnit.test( "Filter reverse", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|reverse }}", {"value":['first item', 'second item', 'third item']});

    assert.equal( rendered_template, 'third item,second item,first item' );
});

QUnit.test( "Filter repeat_arr", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|repeat_arr:3 }}", {"value":'item'});

    assert.equal( rendered_template, 'item,item,item' );
});

QUnit.test( "Filter length", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|length }}", {"value":['first item', 'second item', 'third item']});

    assert.equal( rendered_template, '3' );
});

QUnit.test( "Filter length_is", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|length_is:3 }}", {"value":['first item', 'second item', 'third item']});

    assert.equal( rendered_template, 'true' );
});

QUnit.test( "Filter slice1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|slice:'1:' }}", {"value":['item0', 'item1', 'item2', 'item3', 'item4', 'item5']});

    assert.equal( rendered_template, 'item1,item2,item3,item4,item5' );
});

QUnit.test( "Filter slice", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|slice:'1:4' }}", {"value":['item0', 'item1', 'item2', 'item3', 'item4', 'item5']});

    assert.equal( rendered_template, 'item1,item2,item3' );
});

QUnit.test( "Filter slice3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|slice:'::2' }}", {"value":['item0', 'item1', 'item2', 'item3', 'item4']});

    assert.equal( rendered_template, 'item0,item2,item4' );
});

QUnit.test( "Filter unordered_list", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|unordered_list }}", {"value":['States', ['Kansas', ['Lawrence', 'Topeka'], 'Illinois']]});

    assert.equal( rendered_template, `	<li>States
	<ul>
		<li>Kansas
		<ul>
			<li>Lawrence</li>
			<li>Topeka</li>
		</ul>
		</li>
		<li>Illinois</li>
	</ul>
	</li>`);
});

QUnit.test( "Filter add", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|add:5 }}", {"value":10});

    assert.equal( rendered_template, '15' );
});

QUnit.test( "Filter filesizeformat1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|filesizeformat }}", {"value": 16761});

    assert.equal( rendered_template, '16 KB' );
});

QUnit.test( "Filter filesizeformat2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|filesizeformat }}", {"value": 39237394});

    assert.equal( rendered_template, '37 MB' );
});

QUnit.test( "Filter pluralize1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("vote{{ value|pluralize }}", {"value": 0});

    assert.equal( rendered_template, 'votes' );
});

QUnit.test( "Filter pluralize2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("vote{{ value|pluralize }}", {"value": 1});

    assert.equal( rendered_template, 'vote' );
});

QUnit.test( "Filter pluralize3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("vote{{ value|pluralize }}", {"value": 2});

    assert.equal( rendered_template, 'votes' );
});

QUnit.test( "Filter pluralize4", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("class{{ value|pluralize:'es' }}", {"value": 0});

    assert.equal( rendered_template, 'classes' );
});

QUnit.test( "Filter pluralize5", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("class{{ value|pluralize:'es' }}", {"value": 1});

    assert.equal( rendered_template, 'class' );
});

QUnit.test( "Filter pluralize6", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("class{{ value|pluralize:'es' }}", {"value": 2});

    assert.equal( rendered_template, 'classes' );
});

QUnit.test( "Filter pluralize6", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("cand{{ value|pluralize:'y,ies' }}", {"value": 0});

    assert.equal( rendered_template, 'candies' );
});

QUnit.test( "Filter pluralize7", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("cand{{ value|pluralize:'y,ies' }}", {"value": 1});

    assert.equal( rendered_template, 'candy' );
});

QUnit.test( "Filter pluralize8", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("cand{{ value|pluralize:'y,ies' }}", {"value": 2});

    assert.equal( rendered_template, 'candies' );
});

 
QUnit.test( "Filter divisibleby1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if 10|divisibleby:2 %}1{% else %}0{% endif %}");

    assert.equal( rendered_template, '1');
});   

QUnit.test( "Filter divisibleby2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if '15'|divisibleby:5 %}1{% else %}0{% endif %}");

    assert.equal( rendered_template, '1');
});  

QUnit.test( "Filter divisibleby3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if 9|divisibleby:'3' %}1{% else %}0{% endif %}");

    assert.equal( rendered_template, '1');
});  

QUnit.test( "Filter divisibleby4", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% if 10|divisibleby:'3' %}1{% else %}0{% endif %}");

    assert.equal( rendered_template, '0');
}); 


QUnit.test( "Filter default_if_none", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ arg|default_if_none:'default_value' }}", {'arg': null});

    assert.equal( rendered_template, 'default_value');
});  


QUnit.test( "Filter default1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{arg|default:'default_value'}}");

    assert.equal( rendered_template, 'default_value');
});
    
QUnit.test( "Filter default2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{arg|default:default_value}}", {default_value: 4});

    assert.equal( rendered_template, '4');
});

QUnit.test( "Filter time", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|time }}", {
        'value': 0
    });

    assert.equal( rendered_template, '16:00:00');
});

QUnit.test( "Filter timesince", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|timesince:5000 }}", {
        'value': 0
    });

    assert.equal( rendered_template, '53 years, 4 months');
});

QUnit.test( "Filter timeuntil", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|timeuntil:0 }}", {
        'value': 5000
    });

    assert.equal( rendered_template, '53 years, 4 months');
});

QUnit.test( "Filter date", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{{ value|date }}", {
        'value': 0
    });

    assert.equal( rendered_template, '31 Dec., 4:00:pm');
});

QUnit.test( "Tag for unpack single element", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for i in options %}{{ i }}{% endfor %}", {"options": ['option 1', 'option 2', 'option 3', 'option 4']});

    assert.equal( rendered_template, 'option 1option 2option 3option 4');
});

QUnit.test( "Tag for unpack multiple", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for x,y in options %}{{ x }}{{ y }}{% endfor %}", {"options": [[1,2], [3,4], [5,6]]});

    assert.equal( rendered_template, '123456');
});

QUnit.test( "Tag for counter variable", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for i in options %}option {{ forloop.counter }}{% endfor %}", {"options": [1, 2, 3, 4]});

    assert.equal( rendered_template, 'option 1option 2option 3option 4');
});

QUnit.test( "Tag for counter0 variable", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for i in options %}option {{ forloop.counter0 }}{% endfor %}", {"options": [1, 2, 3, 4]});

    assert.equal( rendered_template, 'option 0option 1option 2option 3');
});

QUnit.test( "Tag for revcounter variable", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for i in options %}option {{ forloop.revcounter }}{% endfor %}", {"options": [1, 2, 3, 4]});

    assert.equal( rendered_template, 'option 4option 3option 2option 1');
});

QUnit.test( "Tag for revcounter0 variable", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for i in options %}option {{ forloop.revcounter0 }}{% endfor %}", {"options": [1, 2, 3, 4]});

    assert.equal( rendered_template, 'option 3option 2option 1option 0');
});

QUnit.test( "Tag for first variable", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for i in options %}{% if forloop.first %}First element is {{ i }}{% endif %}{% endfor %}", {"options": [1, 2, 3, 4]});

    assert.equal( rendered_template, 'First element is 1');
});

QUnit.test( "Tag for parentloop", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for i in options %}{% for j in options %}{{ forloop.parentloop.counter }}{{ forloop.counter }} {% endfor %}{% endfor %}", {"options": [1, 2, 3, 4]});

    assert.equal( rendered_template, '11 12 13 14 21 22 23 24 31 32 33 34 41 42 43 44 ');
});

QUnit.test( "Tag for last variable", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for i in options %}{% if forloop.last %}Last element is {{ i }}{% endif %}{% endfor %}", {"options": [1, 2, 3, 4]});

    assert.equal( rendered_template, 'Last element is 4');
});

QUnit.test( "Tag with1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% with var='value' %}{{ var }}{% endwith %}");

    assert.equal( rendered_template, 'value');
});

QUnit.test( "Tag with2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% with data=params.key1 %}{{ data.key2 }}{% endwith %}", {"params": {'key1':{'key2': 'value'}}});

    assert.equal( rendered_template, 'value');
});

QUnit.test( "Tag comment", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% comment %}This is a\nmultiline comment{% endcomment %}");

    assert.equal( rendered_template, '');
});

QUnit.test( "Tag cycle", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for o in list %}{% cycle 'item1' 'item2' 'item3' 'item4' %}{% endfor %}", {'list': [1, 2, 3, 4]});

    assert.equal( rendered_template, 'item1item2item3item4');
});

QUnit.test( "Tag resetcycle", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% for o in list %}{% cycle 'item1' 'item2' 'item3' 'item4' %}{% if o == 2 %}{% resetcycle %}{% endif %}{% endfor %}", {'list': [1, 2, 3, 4]});

    assert.equal( rendered_template, 'item1item2item1item2');
});

QUnit.test( "Tag widthratio", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% widthratio this_value max_value max_width %}", {'this_value': 175, 'max_value': 200 , 'max_width': 100});

    assert.equal( rendered_template, '87');
});

QUnit.test( "Tag autoescape", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% autoescape off %}{{ html }}{% endautoescape %}", {'html': '<h1>this is a test</h1>'});

    assert.equal( rendered_template, '<h1>this is a test</h1>');
});

QUnit.test( "Nested tag autoescape", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% autoescape off %}{% autoescape on %}{{ html }}{% endautoescape %}{% endautoescape %}", {'html': '<h1>this is a test</h1>'});

    assert.equal( rendered_template, '&lt;h1&gt;this is a test&lt;/h1&gt;');
});

QUnit.test( "Tag load1", function( assert ) {
    var library = DjangoTemplateEngine.createTemplateLibrary();
    library.filter('test', function(value, arg){
        return 'test';
    });

    var rendered_template = DjangoTemplateEngine.renderTemplate("{% load mylib %}{{ myvar|test }}", null, null, {
        'libraries': {
            'mylib': library
        }
    });

    assert.equal( rendered_template, 'test');
});


QUnit.test( "Tag load2", function( assert ) {
    var library = DjangoTemplateEngine.createTemplateLibrary();
    library.simpleTag('test', function(kwargs){
        return kwargs.var1+ kwargs.var2;
    });

    var rendered_template = DjangoTemplateEngine.renderTemplate("{% load mylib %}{% test var1='value1' var2='value2' %}", null, null, {
        'libraries': {
            'mylib': library
        }
    });

    assert.equal( rendered_template, 'value1value2');
});

QUnit.test( "Tag load3", function( assert ) {
    var library = DjangoTemplateEngine.createTemplateLibrary();
    library.simpleTag('test', function(var1, var2){
        return var1+ var2;
    });

    var rendered_template = DjangoTemplateEngine.renderTemplate("{% load mylib %}{% test var1 'value2' %}", {'var1': 'value1'}, null, {
        'libraries': {
            'mylib': library
        }
    });

    assert.equal( rendered_template, 'value1value2');
});

QUnit.test( "Tag load4", function( assert ) {
    var library = DjangoTemplateEngine.createTemplateLibrary();
    library.simpleTag('test', function(var1, var2, kwargs){
        return var1+ var2 + kwargs.var3;
    });

    var rendered_template = DjangoTemplateEngine.renderTemplate("{% load mylib %}{% test var1 var2 var3='value3' %}", {'var1': 'value1', 'var2': 'value2'}, null, {
        'libraries': {
            'mylib': library
        }
    });

    assert.equal( rendered_template, 'value1value2value3');
});

QUnit.test( "Tag load5", function( assert ) {  
    var engine = new DjangoTemplateEngine({
        'my_template': '{{ choices.0 }}{{ choices.1 }}'
    });
    
    var library = engine.createLibrary('mylib');
  
    library.inclusionTag('my_template', function show_choices(){
        var choices = ['choice1', 'choice2'];
        return {'choices': choices}
    })

    var rendered_template = engine.renderTemplateString("{% load mylib %}{% show_choices %}");

    assert.equal( rendered_template, 'choice1choice2');
});


    
QUnit.test( "Tag debug", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% debug %}");

    assert.equal( rendered_template, 'True: true\nFalse: false\nNone: null');
});


QUnit.test( "Tag spaceless", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate(`{% spaceless %}
        <p>
            <a href="foo/">Foo</a>
        </p>
    {% endspaceless %}`);

    assert.equal( rendered_template, '<p><a href="foo/">Foo</a></p>');
});


QUnit.test( "Tag verbatim", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate(`{% verbatim %}{% don't process this %}{% endverbatim %}`);

    assert.equal( rendered_template, "{% don't process this %}");
});


QUnit.test( "Tag regroup", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate(`{% regroup musicians by instrument as grouped %}<ul>
{% for group in grouped %}    <li>{{ group.grouper }}
        <ul>
            {% for musician in group.list %}<li>{{ musician.name }}</li>{% endfor %}
        </ul>
    </li>
{% endfor %}</ul>`, {
            'musicians': [
                {
                    'name': 'Django Reinhardt',
                    'instrument': 'Guitar'
                },
                {
                    'name': 'Emily Remler',
                    'instrument': 'Guitar'
                },
                {
                    'name': 'Lovie Austin',
                    'instrument': 'Piano'
                },
                {
                    'name': 'Bud Powell',
                    'instrument': 'Piano'
                },
                {
                    'name': 'Duke Ellington',
                    'instrument': 'Trumpet'
                }  
            ]
        }
    );

    assert.equal( rendered_template, `<ul>
    <li>Guitar
        <ul>
            <li>Django Reinhardt</li><li>Emily Remler</li>
        </ul>
    </li>
    <li>Piano
        <ul>
            <li>Lovie Austin</li><li>Bud Powell</li>
        </ul>
    </li>
    <li>Trumpet
        <ul>
            <li>Duke Ellington</li>
        </ul>
    </li>
</ul>`);
});


QUnit.test( "Tag firstof1", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% firstof var1 var2 var3 as myvar %}{{ myvar }}", {
       'var2': 'something'
    });

    assert.equal( rendered_template, 'something');
});   
   

QUnit.test( "Tag firstof2", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% firstof var1 var2 var3 'fallback value' %}");

    assert.equal( rendered_template, 'fallback value');
});


QUnit.test( "Tag firstof3", function( assert ) {
    var rendered_template = DjangoTemplateEngine.renderTemplate("{% firstof var1 var2 var3 %}", {
       'var1': false,
       'var3': null,
       'var3': 0
    });

    assert.equal( rendered_template, '');
});


QUnit.test( "Tag now", function( assert ) {
    patch_date_object(function(unpatch){
        var rendered_template = DjangoTemplateEngine.renderTemplate('{% now "jS F Y H:i" %}');
        
        unpatch();

        assert.equal( rendered_template, '31st December 1969 16:00');
    });
});