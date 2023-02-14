# Django Template Engine in Javascript
This is a port of django templates to javascript. 

119 unit tests.

Advantages of using django js template engine:
- Create AJAX applications using django templates. No need to learn or to use another template engine.
- You can convert your django applications to AJAX and reuse all your current django templates. This engine makes the transition to AJAX smoother.
- Less load to the backend because the rendering of the django templates is done in the frontend.


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

To render a single template, use the function `DjangoTemplateEngine.renderTemplate` like in the 'Hello World!' example before.
```js
DjangoTemplateEngine.renderTemplate(template_code, context, options)
```

These are the parameters of `DjangoTemplateEngine.renderTemplate`:

- **template_code:** Template that you want to render
- **context:** (optional) Dictionary of template variables
- **options:** (optional) Dictionary of options used to create an instance of `DjangoTemplateEngine`

If your template is extending and including other templates using `extend` and `include` tags, create an instance of `DjangoTemplateEngine`:
```js
var templateEngineInstance = new DjangoTemplateEngine(templateSources, options)
```

These are the arguments:

- **templateSources:** A dictionary containing template names and associated template sources.
- **options:** A dictionary containing these possible options:
    - **autoescape:** Autoescape variables by default. Default: true.
    - **debug:** Enable debugging. Default: false.
    - **libraries:** A dictionary of library names and library instances. To create a library instance, call the function `DjangoTemplateEngine.createTemplateLibrary`. After creating the library instance, you can start adding custom filters and tags. 
    - **string_if_invalid:** String to use if the template variable does not exists.


The default context builtins are:
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


### Template engine instance methods

In the template engine instance, we have registered one or several templates using the parameter **templateSources** during the creation of the instance. To render a specific template using its name, just use the instance method `renderToString`:
```js
engine.renderToString(template_name, context)
```

Example:
- We register 2 templates called "*included_template*" and "*main_template*" (the name of the templates could be anything). The main template is making use of an `include` tag 
```js
var engine = new DjangoTemplateEngine({
    "included_template": "This is included",
    "main_template": "Testing including another template {% include 'included_template' %}. More here"
});

var rendered_template = engine.renderToString("main_template");
```

- We register 2 templates called "*base_template*" and "*main_template*". The main template is making use of an `extend` tag:
```js
var engine = new DjangoTemplateEngine({
    "base_template": "document extended {% block content %}{% endblock %} text from the base template at the footer",
    "main_template": "{% extends 'base_template' %} {% block content %}text here...{% endblock %}"
});
var rendered_template = engine.renderToString("main_template");
```

To render a template string, use:
```js
engine.renderTemplateString(template_code, context)
```

To create a template library and register at the same time with a given `name`:
```js
var library = engine.createLibrary(name)
```

Another possibility is to use `DjangoTemplateEngine.createTemplateLibrary` to create a library instance. But in this last case the library is not registered yet. Use the instance method 'addLibrary' of the template engine to register the new library with a given name. Example:
```js
var library = DjangoTemplateEngine.createTemplateLibrary();
engine.addLibrary('my_library', library)
```

To add a filter to the new library instance:
```js
library.filter(function filter_name(value, arg, autoescape){
})
```

Optionally you can add flags:
```js  
library.filter(function filter_name(value, arg, autoescape){
}, flags)
```

Available flags are:
- needs_autoescape
- is_safe


You can pass explicitly the name of the filter instead of relying in the function name.
```js   
library.filter(filter_name, function(value, arg, autoescape){
}, flags)
```

If the fitler is only manipulating strings, you can use `library.stringfilter` to get automatically a string as a first argument and to return a safe string in case that the original string is safe.


To add a tag:
```js
library.tag(function tag_name(parser, token){
})
```

Or this method signature, in case you want to be explicit with the tag name:
```js
library.tag(tag_name, function(parser, token){
})
```

To register a callable as a compiled template tag:
```js
library.simpleTag(function mytag(arg1, arg2, arg3, ..., kwargs){
    return 'world'
});
```

The first arguments provided in the simple tag function are the positional arguments provided when using the tag in the template. The last argument is always the keywords arguments.

In this example:
```js
{% mytag var1 var2 var3 kwarg1='value1' kwarg2='value2' %}
```

the function `mytag` will be called with these paremeters:
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

## Similar projects
- https://github.com/chrisdickinson/plate
- https://github.com/mozilla/nunjucks
- https://github.com/cloudratha/djanjucks