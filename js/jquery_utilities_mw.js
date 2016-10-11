//jQuery utility functions by Mark Williams
(function($) {
    var use_expressions = $.browser.msie && 
        ($.browser.version <= 7 || document.documentMode < 8);
    var style_added = false;

    function add_stylesheet()
    {
        if (!style_added) {
            var sheet = '<style type="text/css">div.bgiframe-mask, iframe.bgiframe {'+
                'background-color: inherit;'+
                'border:0;margin:0;position:absolute;top:0;left:0;z-index:-1;';
            if (use_expressions) {
                sheet += 'height:expression(this.parentNode.clientHeight);width:expression(this.parentNode.clientWidth);';
            } else {
                sheet += 'height:100%;width:100%';
            }
            sheet += '}</style>';

            $('head').append(sheet);
            style_added = true;
        }
    }

    $.each("draggable,resizable".split(","), function() {
	var type = this;

	$.ui.plugin.add(type, "iframeMask", {
	    start: function(event, ui) {
                var that = this.data(type);
		if ($.browser.msie) {
                    document.body.setCapture();
		    $(document.body)
		        .bind('mousemove.'+that.widgetName, that._mouseMoveDelegate)
		        .bind('mouseup.'+that.widgetName, that._mouseUpDelegate);
                }
		var o = that.options;
		if ($(o.iframeMask === true ? "iframe" : o.iframeMask,this.parent()).length) {
		    $('<div class="ui-'+type+'-iframeMask" style="background:#fff;"></div>')
			.css({
			    width: "100%", height: "100%", top: 0, left : 0,
			    position: "absolute", opacity: "0.001", zIndex: 1000
			})
			.appendTo(this.parent());
		};
	    },
	    stop: function(event, ui) {
		if ($.browser.msie) {
                    var that = this.data(type);
	            $(document.body)
		        .unbind('mousemove.'+that.widgetName,that._mouseMoveDelegate)
		        .unbind('mouseup.'+that.widgetName,that._mouseUpDelegate);
	            document.body.releaseCapture();
                }
		$("div.ui-"+type+"-iframeMask", this.parent()).remove()
	    }
	});

    //$.ui[this].defaults.iframeMask = true;
    }); 

    function eprop(style,t,s) {
        var n = s[t];
        if (n != null && n != "auto") {
            style[t] = n;
        }
    }

    function createMask(s,cn) {
        add_stylesheet();
        var shim = document.createElement('div');
        shim.className = cn+"-mask";
        eprop(shim.style, "height", s);
        eprop(shim.style, "width", s);
        eprop(shim.style, "left", s);
        eprop(shim.style, "top", s);
        eprop(shim.style, "zIndex", s);
        if (s.mask_color)
            shim.style.backgroundColor = s.mask_color;
        $(shim).css({opacity:s.opacity||0.001});
        return shim;
    }

    function createShim(s,cn) {
        add_stylesheet();
        var shim = document.createElement('iframe');
        shim.frameBorder = 0;
        shim.scrolling = "no";
        shim.src = s.src;
        shim.className = cn;

        eprop(shim.style, "height", s);
        eprop(shim.style, "width", s);
        eprop(shim.style, "left", s);
        eprop(shim.style, "top", s);
        eprop(shim.style, "zIndex", s);
        return shim;
    }

    $.fn.bgIframe = $.fn.bgiframe = $.bgiframe = function(s) {
        if (typeof s == "string") {
            var items = this;
            if (this === $) {
                items = $('.bgiframe');
            }
            if (s == "fix") {
                // In FF, if an iframe is created before the object its
                // trying to shim, it doesnt work. We have to remove, and
                // re-insert it
                items.each(function() {
                    var s = this.nextSibling;
                    var p = this.parentNode;
                    p.removeChild(this);
                    p.insertBefore(this,s);
                });
            } else if (s == "remove") {
                items.parent().find(".bgiframe-mask").remove();
                items.remove();
            } else {
                throw "unknown bgiframe method: "+s;
            }
        } else if (this.length) {
            s = $.extend({}, $.bgiframe.defaults, s || {});
            var cn = s.eclass ? s.eclass + " " : "";
            cn += "bgiframe";
            return this.each(function() {
                if ( $('> iframe.bgiframe', this).length ==0 ) {
                    if (s.mask) {
                        this.insertBefore(createMask(s,cn),this.firstChild);
                    }
                    this.insertBefore(createShim(s,cn),this.firstChild );
                }
            });
        }
        return this;
    };

    $.bgiframe.defaults = {
        top     : 'auto',
        left    : 'auto',
        width   : 'auto',
        height  : 'auto',
        src     : 'about:blank',
        mask_color : "white"
    };
})(jQuery);
