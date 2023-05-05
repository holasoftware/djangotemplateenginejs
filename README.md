# Django Template Engine in Javascript
This is a port of django templates to javascript. 

155 unit tests.

Advantages of using django js template engine:
- You can continue using django templates in the frontend. No need to learn or to use another template engine.
- Convert more easily your django applications to AJAX rendering all your current django templates directly to the frontend.
- Less overload in the backend because the server is not doing the work of rendering the templates.

Demo: https://holasoftware.github.io/djangotemplateenginejs/

## Version
0.6

## Getting started
Include the javascript file:
```
<script src="django_template_engine.js"></script>
```

We will render in the console `Hello World!`:
```js
var rendered_template = DjangoTemplateEngine.renderTemplate('{{var}}', {'var': 'Hello World!'});
console.log(rendered_template);
```


## Tutorial
The source code of the template engine is only one file and has zero dependencies. To use the engine just include:
```
<script src="django_template_engine.js"></script>
```

There is only one variable exported to the global namespace: `DjangoTemplateEngine`

The easy and more direct way to render a template is using the function `DjangoTemplateEngine.renderTemplate` like in the 'Hello World!' example:
```js
DjangoTemplateEngine.renderTemplate(templateCode, context, otherTemplateSources, templateEngineOptions)
```

These are the parameters:

- **templateCode:** Template that you want to render
- **context:** (optional) Dictionary of template variables
- **otherTemplateSources:** (optional) A dictionary containing template names and associated template sources. These other templates could be used for extending a base template or including other templates in the main template.
- **templateEngineOptions:** (optional) Dictionary of options used to create a django template engine:
    - **autoescape:** Autoescape variables by default. Default: true.
    - **debug:** Enable debugging. Default: false.
    - **libraries:** A dictionary of library names and library instances. To create a library instance, call the function `DjangoTemplateEngine.createTemplateLibrary`. After creating the library instance, you can start adding custom filters and tags. 
    - **string_if_invalid:** String to use if the template variable does not exists.

When rendering, there is some context builtins like in the original django template engine:
```
{
    'True': true,
    'False': false,
    'None': null
}
```

To add more context builtins just use:
```js
DjangoTemplateEngine.addToContextBuiltins( dict )
```


### Template engine
If you need to reuse several templates multiple times, it's better for  performance reasons to create a template engine:
```js
var engine = new DjangoTemplateEngine({
    'my_template': 'This is a {{ var }}'
})
var rendered_template = engine.renderToString('my_template', {
    'var': 'template variable'
})

// Output: This is a template variable
console.log(rendered_template);
```

Inside a template engine, the template sources are being parsed and converted to a `Template` object only in the moment of being used for rendering and the created `Template` objects are reused everytime that are necessary to render other templates. For that reason, this is more efficient because no need to parse again the template source and to convert that template source to an internal data structure.

This is the signature of `new DjangoTemplateEngine`:
```js
var templateEngineInstance = new DjangoTemplateEngine(templateSources, options)
```

`templateSources` is a dictionary of template names and template sources.

`options` is exactly like the parameter `options` in the function `DjangoTemplateEngine.renderTemplate` and it's also optional.
    
The signature for `engine.renderToString` is:
```js
engine.renderToString(templateName, context)
```

**Example 1**: We register a template "*included_template*" and another one "*main_template*" making use of an `include` tag 
```js
var engine = new DjangoTemplateEngine({
    "included_template": "This is included",
    "main_template": "Testing including another template {% include 'included_template' %}. More here"
});

var rendered_template = engine.renderToString("main_template");
```

**Example 2**: We register a template "*base_template*" and another one "*main_template*" making use of an `extend` tag:
```js
var engine = new DjangoTemplateEngine({
    "base_template": "document extended {% block content %}{% endblock %} text from the base template at the footer",
    "main_template": "{% extends 'base_template' %} {% block content %}text here...{% endblock %}"
});
var rendered_template = engine.renderToString("main_template");
```

To render a template string using the engine:
```js
engine.renderTemplateString(templateCode, context)
```

To create a template library and register at the same time the library with a  `name`:
```js
var library = engine.createLibrary(name)
```

Another possibility is:
```js
var library = DjangoTemplateEngine.createTemplateLibrary();
// Register filters and tags to the new library here...
engine.addLibrary('my_library', library)
```

We used the function `DjangoTemplateEngine.createTemplateLibrary` to create a library instance, and then we registered later that library to a template engine with the name *my_library*.

To add a filter to the new template library:
```js
library.filter(function filter_name(value, arg, autoescape){
    // the code of the filter here...
})
```

Optionally you can add flags:
```js  
library.filter(function filter_name(value, arg, autoescape){
    // the code of the filter here...
}, flags)
```

Flags is a dictionary of boolean parameters. Available flags are:
- needs_autoescape
- is_safe


You can pass explicitly the name of the filter instead of relying in the function name.
```js   
library.filter(filter_name, function(value, arg, autoescape){
    // the code of the filter here...
}, flags)
```

If the filter is only processing strings, you can use `library.stringfilter` to get automatically a string as the first argument of the function and to return automatically a safe string in case that the original argument was also a safe string. Example:
```js
library.stringfilter('add_dot', function(str) {
    return str + '.';
})
```

To add a tag:
```js
library.tag(function tag_name(parser, token){
    // the code of the tag here...
})
```

Or this method signature, in case you want to be explicit with the tag name:
```js
library.tag(tag_name, function(parser, token){
    // the code of the tag here...
})
```

To register a callable as a simple template tag:
```js
library.simpleTag(function mytag(arg1, arg2, arg3, ..., kwargs){
    return 'your string...'
});
```

The first arguments provided in the simple tag function are the positional arguments provided when were used the tag in the template. The last argument is always the keywords arguments.

In this example:
```js
{% mytag var1 var2 var3 kwarg1='value1' kwarg2='value2' %}
```

the function `mytag` will be called with these parameters:
```js
mytag(var1, var2, var3, {'kwarg1':'value1', 'kwarg2':'value2'})
```

To register a callable as an inclusion tag:
```js
library.inclusionTag('results.html', function show_results(){
    var choices = ['choice1', 'choice2'];
    return {'choices': choices}
})
```

## Tests
The unit tests are in this file `tests/tests.js` and are based on the library QUnit JS. Reading the tests you also have more examples of the usage of the django template engine.


## Similar projects
- https://github.com/chrisdickinson/plate
- https://github.com/mozilla/nunjucks
- https://github.com/cloudratha/djanjucks