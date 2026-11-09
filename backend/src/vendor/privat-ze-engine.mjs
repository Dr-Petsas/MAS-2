// GENERIERT aus F:\PlanR\ZE\Privat-HKP (src/clara/index.ts) – nicht von Hand ändern.
// Neu bauen: cd F:\PlanR\ZE\Privat-HKP && npm run build:engine   (sha256 82cff43f4bf5)
//#region \0rolldown/runtime.js
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
//#endregion
//#region ../HKP/node_modules/react/cjs/react.production.js
/**
* @license React
* react.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_production$1 = /* @__PURE__ */ __commonJSMin(((exports) => {
	var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
	var REACT_PORTAL_TYPE = Symbol.for("react.portal");
	var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
	var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
	var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
	var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
	var REACT_CONTEXT_TYPE = Symbol.for("react.context");
	var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
	var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
	var REACT_MEMO_TYPE = Symbol.for("react.memo");
	var REACT_LAZY_TYPE = Symbol.for("react.lazy");
	var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
	var REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition");
	var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
	function getIteratorFn(maybeIterable) {
		if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
		maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
		return "function" === typeof maybeIterable ? maybeIterable : null;
	}
	var ReactNoopUpdateQueue = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	};
	var assign = Object.assign;
	var emptyObject = {};
	function Component(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	Component.prototype.isReactComponent = {};
	Component.prototype.setState = function(partialState, callback) {
		if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, partialState, callback, "setState");
	};
	Component.prototype.forceUpdate = function(callback) {
		this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
	};
	function ComponentDummy() {}
	ComponentDummy.prototype = Component.prototype;
	function PureComponent(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
	pureComponentPrototype.constructor = PureComponent;
	assign(pureComponentPrototype, Component.prototype);
	pureComponentPrototype.isPureReactComponent = !0;
	var isArrayImpl = Array.isArray;
	function noop() {}
	var ReactSharedInternals = {
		H: null,
		A: null,
		T: null,
		S: null
	};
	var hasOwnProperty = Object.prototype.hasOwnProperty;
	function ReactElement(type, key, props) {
		var refProp = props.ref;
		return {
			$$typeof: REACT_ELEMENT_TYPE,
			type,
			key,
			ref: void 0 !== refProp ? refProp : null,
			props
		};
	}
	function cloneAndReplaceKey(oldElement, newKey) {
		return ReactElement(oldElement.type, newKey, oldElement.props);
	}
	function isValidElement(object) {
		return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
	}
	function escape(key) {
		var escaperLookup = {
			"=": "=0",
			":": "=2"
		};
		return "$" + key.replace(/[=:]/g, function(match) {
			return escaperLookup[match];
		});
	}
	var userProvidedKeyEscapeRegex = /\/+/g;
	function getElementKey(element, index) {
		return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
	}
	function resolveThenable(thenable) {
		switch (thenable.status) {
			case "fulfilled": return thenable.value;
			case "rejected": throw thenable.reason;
			default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
				"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
			}, function(error) {
				"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
			})), thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
			}
		}
		throw thenable;
	}
	function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
		var type = typeof children;
		if ("undefined" === type || "boolean" === type) children = null;
		var invokeCallback = !1;
		if (null === children) invokeCallback = !0;
		else switch (type) {
			case "bigint":
			case "string":
			case "number":
				invokeCallback = !0;
				break;
			case "object": switch (children.$$typeof) {
				case REACT_ELEMENT_TYPE:
				case REACT_PORTAL_TYPE:
					invokeCallback = !0;
					break;
				case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
			}
		}
		if (invokeCallback) return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
			return c;
		})) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + invokeCallback)), array.push(callback)), 1;
		invokeCallback = 0;
		var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
		if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if (i = getIteratorFn(children), "function" === typeof i) for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if ("object" === type) {
			if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
			array = String(children);
			throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
		}
		return invokeCallback;
	}
	function mapChildren(children, func, context) {
		if (null == children) return children;
		var result = [], count = 0;
		mapIntoArray(children, result, "", "", function(child) {
			return func.call(context, child, count++);
		});
		return result;
	}
	function lazyInitializer(payload) {
		if (-1 === payload._status) {
			var ctor = payload._result, thenable = ctor();
			thenable.then(function(moduleObject) {
				if (0 === payload._status || -1 === payload._status) payload._status = 1, payload._result = moduleObject, void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
			}, function(error) {
				if (0 === payload._status || -1 === payload._status) payload._status = 2, payload._result = error, void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
			});
			-1 === payload._status && (payload._status = 0, payload._result = thenable);
		}
		if (1 === payload._status) return payload._result.default;
		throw payload._result;
	}
	var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
		if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
			var event = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
				error
			});
			if (!window.dispatchEvent(event)) return;
		} else if ("object" === typeof process && "function" === typeof process.emit) {
			process.emit("uncaughtException", error);
			return;
		}
		console.error(error);
	};
	function startTransition(scope) {
		var prevTransition = ReactSharedInternals.T, currentTransition = {};
		currentTransition.types = null !== prevTransition ? prevTransition.types : null;
		ReactSharedInternals.T = currentTransition;
		try {
			var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
			null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
			"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
		} catch (error) {
			reportGlobalError(error);
		} finally {
			null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
		}
	}
	function addTransitionType(type) {
		var transition = ReactSharedInternals.T;
		if (null !== transition) {
			var transitionTypes = transition.types;
			null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
		} else startTransition(addTransitionType.bind(null, type));
	}
	var Children = {
		map: mapChildren,
		forEach: function(children, forEachFunc, forEachContext) {
			mapChildren(children, function() {
				forEachFunc.apply(this, arguments);
			}, forEachContext);
		},
		count: function(children) {
			var n = 0;
			mapChildren(children, function() {
				n++;
			});
			return n;
		},
		toArray: function(children) {
			return mapChildren(children, function(child) {
				return child;
			}) || [];
		},
		only: function(children) {
			if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
			return children;
		}
	};
	exports.Activity = REACT_ACTIVITY_TYPE;
	exports.Children = Children;
	exports.Component = Component;
	exports.Fragment = REACT_FRAGMENT_TYPE;
	exports.Profiler = REACT_PROFILER_TYPE;
	exports.PureComponent = PureComponent;
	exports.StrictMode = REACT_STRICT_MODE_TYPE;
	exports.Suspense = REACT_SUSPENSE_TYPE;
	exports.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
	exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
	exports.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(size) {
			return ReactSharedInternals.H.useMemoCache(size);
		}
	};
	exports.addTransitionType = addTransitionType;
	exports.cache = function(fn) {
		return function() {
			return fn.apply(null, arguments);
		};
	};
	exports.cacheSignal = function() {
		return null;
	};
	exports.cloneElement = function(element, config, children) {
		if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
		var props = assign({}, element.props), key = element.key;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
		var propName = arguments.length - 2;
		if (1 === propName) props.children = children;
		else if (1 < propName) {
			for (var childArray = Array(propName), i = 0; i < propName; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		return ReactElement(element.type, key, props);
	};
	exports.createContext = function(defaultValue) {
		defaultValue = {
			$$typeof: REACT_CONTEXT_TYPE,
			_currentValue: defaultValue,
			_currentValue2: defaultValue,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		};
		defaultValue.Provider = defaultValue;
		defaultValue.Consumer = {
			$$typeof: REACT_CONSUMER_TYPE,
			_context: defaultValue
		};
		return defaultValue;
	};
	exports.createElement = function(type, config, children) {
		var propName, props = {}, key = null;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
		var childrenLength = arguments.length - 2;
		if (1 === childrenLength) props.children = children;
		else if (1 < childrenLength) {
			for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === props[propName] && (props[propName] = childrenLength[propName]);
		return ReactElement(type, key, props);
	};
	exports.createRef = function() {
		return { current: null };
	};
	exports.forwardRef = function(render) {
		return {
			$$typeof: REACT_FORWARD_REF_TYPE,
			render
		};
	};
	exports.isValidElement = isValidElement;
	exports.lazy = function(ctor) {
		return {
			$$typeof: REACT_LAZY_TYPE,
			_payload: {
				_status: -1,
				_result: ctor
			},
			_init: lazyInitializer
		};
	};
	exports.memo = function(type, compare) {
		return {
			$$typeof: REACT_MEMO_TYPE,
			type,
			compare: void 0 === compare ? null : compare
		};
	};
	exports.startTransition = startTransition;
	exports.unstable_useCacheRefresh = function() {
		return ReactSharedInternals.H.useCacheRefresh();
	};
	exports.use = function(usable) {
		return ReactSharedInternals.H.use(usable);
	};
	exports.useActionState = function(action, initialState, permalink) {
		return ReactSharedInternals.H.useActionState(action, initialState, permalink);
	};
	exports.useCallback = function(callback, deps) {
		return ReactSharedInternals.H.useCallback(callback, deps);
	};
	exports.useContext = function(Context) {
		return ReactSharedInternals.H.useContext(Context);
	};
	exports.useDebugValue = function() {};
	exports.useDeferredValue = function(value, initialValue) {
		return ReactSharedInternals.H.useDeferredValue(value, initialValue);
	};
	exports.useEffect = function(create, deps) {
		return ReactSharedInternals.H.useEffect(create, deps);
	};
	exports.useEffectEvent = function(callback) {
		return ReactSharedInternals.H.useEffectEvent(callback);
	};
	exports.useId = function() {
		return ReactSharedInternals.H.useId();
	};
	exports.useImperativeHandle = function(ref, create, deps) {
		return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
	};
	exports.useInsertionEffect = function(create, deps) {
		return ReactSharedInternals.H.useInsertionEffect(create, deps);
	};
	exports.useLayoutEffect = function(create, deps) {
		return ReactSharedInternals.H.useLayoutEffect(create, deps);
	};
	exports.useMemo = function(create, deps) {
		return ReactSharedInternals.H.useMemo(create, deps);
	};
	exports.useOptimistic = function(passthrough, reducer) {
		return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
	};
	exports.useReducer = function(reducer, initialArg, init) {
		return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
	};
	exports.useRef = function(initialValue) {
		return ReactSharedInternals.H.useRef(initialValue);
	};
	exports.useState = function(initialState) {
		return ReactSharedInternals.H.useState(initialState);
	};
	exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
		return ReactSharedInternals.H.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	};
	exports.useTransition = function() {
		return ReactSharedInternals.H.useTransition();
	};
	exports.version = "19.3.0";
}));
//#endregion
//#region ../HKP/node_modules/react/cjs/react.development.js
/**
* @license React
* react.development.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_development$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	"production" !== process.env.NODE_ENV && (function() {
		function defineDeprecationWarning(methodName, info) {
			Object.defineProperty(Component.prototype, methodName, { get: function() {
				console.warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
			} });
		}
		function getIteratorFn(maybeIterable) {
			if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
			maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
			return "function" === typeof maybeIterable ? maybeIterable : null;
		}
		function warnNoop(publicInstance, callerName) {
			publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
			var warningKey = publicInstance + "." + callerName;
			didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, publicInstance), didWarnStateUpdateForUnmountedComponent[warningKey] = !0);
		}
		function Component(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function ComponentDummy() {}
		function PureComponent(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function noop() {}
		function testStringCoercion(value) {
			return "" + value;
		}
		function checkKeyStringCoercion(value) {
			try {
				testStringCoercion(value);
				var JSCompiler_inline_result = !1;
			} catch (e) {
				JSCompiler_inline_result = !0;
			}
			if (JSCompiler_inline_result) {
				JSCompiler_inline_result = console;
				var JSCompiler_temp_const = JSCompiler_inline_result.error;
				var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
				JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
				return testStringCoercion(value);
			}
		}
		function getComponentNameFromType(type) {
			if (null == type) return null;
			if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
			if ("string" === typeof type) return type;
			switch (type) {
				case REACT_FRAGMENT_TYPE: return "Fragment";
				case REACT_PROFILER_TYPE: return "Profiler";
				case REACT_STRICT_MODE_TYPE: return "StrictMode";
				case REACT_SUSPENSE_TYPE: return "Suspense";
				case REACT_SUSPENSE_LIST_TYPE: return "SuspenseList";
				case REACT_ACTIVITY_TYPE: return "Activity";
				case REACT_VIEW_TRANSITION_TYPE: return "ViewTransition";
			}
			if ("object" === typeof type) switch ("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof) {
				case REACT_PORTAL_TYPE: return "Portal";
				case REACT_CONTEXT_TYPE: return type.displayName || "Context";
				case REACT_CONSUMER_TYPE: return (type._context.displayName || "Context") + ".Consumer";
				case REACT_FORWARD_REF_TYPE:
					var innerType = type.render;
					type = type.displayName;
					type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
					return type;
				case REACT_MEMO_TYPE: return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
				case REACT_LAZY_TYPE:
					innerType = type._payload;
					type = type._init;
					try {
						return getComponentNameFromType(type(innerType));
					} catch (x) {}
			}
			return null;
		}
		function getTaskName(type) {
			if (type === REACT_FRAGMENT_TYPE) return "<>";
			if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
			try {
				var name = getComponentNameFromType(type);
				return name ? "<" + name + ">" : "<...>";
			} catch (x) {
				return "<...>";
			}
		}
		function getOwner() {
			var dispatcher = ReactSharedInternals.A;
			return null === dispatcher ? null : dispatcher.getOwner();
		}
		function UnknownOwner() {
			return Error("react-stack-top-frame");
		}
		function hasValidKey(config) {
			if (hasOwnProperty.call(config, "key")) {
				var getter = Object.getOwnPropertyDescriptor(config, "key").get;
				if (getter && getter.isReactWarning) return !1;
			}
			return void 0 !== config.key;
		}
		function defineKeyPropWarningGetter(props, displayName) {
			function warnAboutAccessingKey() {
				specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
			}
			warnAboutAccessingKey.isReactWarning = !0;
			Object.defineProperty(props, "key", {
				get: warnAboutAccessingKey,
				configurable: !0
			});
		}
		function elementRefGetterWithDeprecationWarning() {
			var componentName = getComponentNameFromType(this.type);
			didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
			componentName = this.props.ref;
			return void 0 !== componentName ? componentName : null;
		}
		function ReactElement(type, key, props, owner, debugStack, debugTask) {
			var refProp = props.ref;
			type = {
				$$typeof: REACT_ELEMENT_TYPE,
				type,
				key,
				props,
				_owner: owner
			};
			null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
				enumerable: !1,
				get: elementRefGetterWithDeprecationWarning
			}) : Object.defineProperty(type, "ref", {
				enumerable: !1,
				value: null
			});
			type._store = {};
			Object.defineProperty(type._store, "validated", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: 0
			});
			Object.defineProperty(type, "_debugInfo", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: null
			});
			Object.defineProperty(type, "_debugStack", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugStack
			});
			Object.defineProperty(type, "_debugTask", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugTask
			});
			Object.freeze && (Object.freeze(type.props), Object.freeze(type));
			return type;
		}
		function cloneAndReplaceKey(oldElement, newKey) {
			newKey = ReactElement(oldElement.type, newKey, oldElement.props, oldElement._owner, oldElement._debugStack, oldElement._debugTask);
			oldElement._store && (newKey._store.validated = oldElement._store.validated);
			return newKey;
		}
		function validateChildKeys(node) {
			isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
		}
		function isValidElement(object) {
			return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
		}
		function escape(key) {
			var escaperLookup = {
				"=": "=0",
				":": "=2"
			};
			return "$" + key.replace(/[=:]/g, function(match) {
				return escaperLookup[match];
			});
		}
		function getElementKey(element, index) {
			return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
		}
		function resolveThenable(thenable) {
			switch (thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
				default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
					"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
				}, function(error) {
					"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
				})), thenable.status) {
					case "fulfilled": return thenable.value;
					case "rejected": throw thenable.reason;
				}
			}
			throw thenable;
		}
		function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
			var type = typeof children;
			if ("undefined" === type || "boolean" === type) children = null;
			var invokeCallback = !1;
			if (null === children) invokeCallback = !0;
			else switch (type) {
				case "bigint":
				case "string":
				case "number":
					invokeCallback = !0;
					break;
				case "object": switch (children.$$typeof) {
					case REACT_ELEMENT_TYPE:
					case REACT_PORTAL_TYPE:
						invokeCallback = !0;
						break;
					case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
				}
			}
			if (invokeCallback) {
				invokeCallback = children;
				callback = callback(invokeCallback);
				var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
				isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
					return c;
				})) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + childKey), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
				return 1;
			}
			invokeCallback = 0;
			childKey = "" === nameSoFar ? "." : nameSoFar + ":";
			if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if (i = getIteratorFn(children), "function" === typeof i) for (i === children.entries && (didWarnAboutMaps || console.warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead."), didWarnAboutMaps = !0), children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if ("object" === type) {
				if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
				array = String(children);
				throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
			}
			return invokeCallback;
		}
		function mapChildren(children, func, context) {
			if (null == children) return children;
			var result = [], count = 0;
			mapIntoArray(children, result, "", "", function(child) {
				return func.call(context, child, count++);
			});
			return result;
		}
		function lazyInitializer(payload) {
			if (-1 === payload._status) {
				var resolveDebugValue = null, rejectDebugValue = null, ioInfo = payload._ioInfo;
				null != ioInfo && (ioInfo.start = ioInfo.end = performance.now(), ioInfo.value = new Promise(function(resolve, reject) {
					resolveDebugValue = resolve;
					rejectDebugValue = reject;
				}));
				ioInfo = payload._result;
				var thenable = ioInfo();
				thenable.then(function(moduleObject) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 1;
						payload._result = moduleObject;
						var _ioInfo = payload._ioInfo;
						if (null != _ioInfo) {
							_ioInfo.end = performance.now();
							var debugValue = null == moduleObject ? void 0 : moduleObject.default;
							resolveDebugValue(debugValue);
							_ioInfo.value.status = "fulfilled";
							_ioInfo.value.value = debugValue;
						}
						void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
					}
				}, function(error) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 2;
						payload._result = error;
						var _ioInfo2 = payload._ioInfo;
						null != _ioInfo2 && (_ioInfo2.end = performance.now(), _ioInfo2.value.then(noop, noop), rejectDebugValue(error), _ioInfo2.value.status = "rejected", _ioInfo2.value.reason = error);
						void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
					}
				});
				ioInfo = payload._ioInfo;
				if (null != ioInfo) {
					var displayName = thenable.displayName;
					"string" === typeof displayName && (ioInfo.name = displayName);
				}
				-1 === payload._status && (payload._status = 0, payload._result = thenable);
			}
			if (1 === payload._status) return ioInfo = payload._result, void 0 === ioInfo && console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", ioInfo), "default" in ioInfo || console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", ioInfo), ioInfo.default;
			throw payload._result;
		}
		function resolveDispatcher() {
			var dispatcher = ReactSharedInternals.H;
			null === dispatcher && console.error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.");
			return dispatcher;
		}
		function releaseAsyncTransition() {
			ReactSharedInternals.asyncTransitions--;
		}
		function startTransition(scope) {
			var prevTransition = ReactSharedInternals.T, currentTransition = {};
			currentTransition.types = null !== prevTransition ? prevTransition.types : null;
			currentTransition._updatedFibers = /* @__PURE__ */ new Set();
			ReactSharedInternals.T = currentTransition;
			try {
				var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
				null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
				"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
			} catch (error) {
				reportGlobalError(error);
			} finally {
				null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.")), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
			}
		}
		function addTransitionType(type) {
			var transition = ReactSharedInternals.T;
			if (null !== transition) {
				var transitionTypes = transition.types;
				null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
			} else 0 === ReactSharedInternals.asyncTransitions && console.error("addTransitionType can only be called inside a `startTransition()` callback. It must be associated with a specific Transition."), startTransition(addTransitionType.bind(null, type));
		}
		function enqueueTask(task) {
			if (null === enqueueTaskImpl) try {
				var requireString = ("require" + Math.random()).slice(0, 7);
				enqueueTaskImpl = (module && module[requireString]).call(module, "timers").setImmediate;
			} catch (_err) {
				enqueueTaskImpl = function(callback) {
					!1 === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = !0, "undefined" === typeof MessageChannel && console.error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."));
					var channel = new MessageChannel();
					channel.port1.onmessage = callback;
					channel.port2.postMessage(void 0);
				};
			}
			return enqueueTaskImpl(task);
		}
		function aggregateErrors(errors) {
			return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
		}
		function popActScope(prevActQueue, prevActScopeDepth) {
			prevActScopeDepth !== actScopeDepth - 1 && console.error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
			actScopeDepth = prevActScopeDepth;
		}
		function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
			var queue = ReactSharedInternals.actQueue;
			if (null !== queue) if (0 !== queue.length) try {
				flushActQueue(queue);
				enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
				});
				return;
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			else ReactSharedInternals.actQueue = null;
			0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
		}
		function flushActQueue(queue) {
			if (!isFlushing) {
				isFlushing = !0;
				var i = 0;
				try {
					for (; i < queue.length; i++) {
						var callback = queue[i];
						do {
							ReactSharedInternals.didUsePromise = !1;
							var continuation = callback(!1);
							if (null !== continuation) {
								if (ReactSharedInternals.didUsePromise) {
									queue[i] = callback;
									queue.splice(0, i);
									return;
								}
								callback = continuation;
							} else break;
						} while (1);
					}
					queue.length = 0;
				} catch (error) {
					queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
				} finally {
					isFlushing = !1;
				}
			}
		}
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
			isMounted: function() {
				return !1;
			},
			enqueueForceUpdate: function(publicInstance) {
				warnNoop(publicInstance, "forceUpdate");
			},
			enqueueReplaceState: function(publicInstance) {
				warnNoop(publicInstance, "replaceState");
			},
			enqueueSetState: function(publicInstance) {
				warnNoop(publicInstance, "setState");
			}
		}, assign = Object.assign, emptyObject = {};
		Object.freeze(emptyObject);
		Component.prototype.isReactComponent = {};
		Component.prototype.setState = function(partialState, callback) {
			if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
			this.updater.enqueueSetState(this, partialState, callback, "setState");
		};
		Component.prototype.forceUpdate = function(callback) {
			this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
		};
		var deprecatedAPIs = {
			isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
			replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
		};
		for (fnName in deprecatedAPIs) deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
		ComponentDummy.prototype = Component.prototype;
		deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
		deprecatedAPIs.constructor = PureComponent;
		assign(deprecatedAPIs, Component.prototype);
		deprecatedAPIs.isPureReactComponent = !0;
		var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = {
			H: null,
			A: null,
			T: null,
			S: null,
			actQueue: null,
			asyncTransitions: 0,
			isBatchingLegacy: !1,
			didScheduleLegacyUpdate: !1,
			didUsePromise: !1,
			thrownErrors: [],
			getCurrentStack: null,
			recentlyCreatedOwnerStacks: 0
		}, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
			return null;
		};
		deprecatedAPIs = { react_stack_bottom_frame: function(callStackForError) {
			return callStackForError();
		} };
		var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
		var didWarnAboutElementRef = {};
		var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(deprecatedAPIs, UnknownOwner)();
		var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
		var didWarnAboutMaps = !1, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
			if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
				var event = new window.ErrorEvent("error", {
					bubbles: !0,
					cancelable: !0,
					message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
					error
				});
				if (!window.dispatchEvent(event)) return;
			} else if ("object" === typeof process && "function" === typeof process.emit) {
				process.emit("uncaughtException", error);
				return;
			}
			console.error(error);
		}, didWarnAboutMessageChannel = !1, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = !1, isFlushing = !1, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
			queueMicrotask(function() {
				return queueMicrotask(callback);
			});
		} : enqueueTask;
		deprecatedAPIs = Object.freeze({
			__proto__: null,
			c: function(size) {
				return resolveDispatcher().useMemoCache(size);
			}
		});
		var fnName = {
			map: mapChildren,
			forEach: function(children, forEachFunc, forEachContext) {
				mapChildren(children, function() {
					forEachFunc.apply(this, arguments);
				}, forEachContext);
			},
			count: function(children) {
				var n = 0;
				mapChildren(children, function() {
					n++;
				});
				return n;
			},
			toArray: function(children) {
				return mapChildren(children, function(child) {
					return child;
				}) || [];
			},
			only: function(children) {
				if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
				return children;
			}
		};
		exports.Activity = REACT_ACTIVITY_TYPE;
		exports.Children = fnName;
		exports.Component = Component;
		exports.Fragment = REACT_FRAGMENT_TYPE;
		exports.Profiler = REACT_PROFILER_TYPE;
		exports.PureComponent = PureComponent;
		exports.StrictMode = REACT_STRICT_MODE_TYPE;
		exports.Suspense = REACT_SUSPENSE_TYPE;
		exports.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
		exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
		exports.__COMPILER_RUNTIME = deprecatedAPIs;
		exports.act = function(callback) {
			var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
			actScopeDepth++;
			var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = !1;
			try {
				var result = callback();
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			if (0 < ReactSharedInternals.thrownErrors.length) throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			if (null !== result && "object" === typeof result && "function" === typeof result.then) {
				var thenable = result;
				queueSeveralMicrotasks(function() {
					didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"));
				});
				return { then: function(resolve, reject) {
					didAwaitActCall = !0;
					thenable.then(function(returnValue) {
						popActScope(prevActQueue, prevActScopeDepth);
						if (0 === prevActScopeDepth) {
							try {
								flushActQueue(queue), enqueueTask(function() {
									return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
								});
							} catch (error$0) {
								ReactSharedInternals.thrownErrors.push(error$0);
							}
							if (0 < ReactSharedInternals.thrownErrors.length) {
								var _thrownError = aggregateErrors(ReactSharedInternals.thrownErrors);
								ReactSharedInternals.thrownErrors.length = 0;
								reject(_thrownError);
							}
						} else resolve(returnValue);
					}, function(error) {
						popActScope(prevActQueue, prevActScopeDepth);
						0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
					});
				} };
			}
			var returnValue$jscomp$0 = result;
			popActScope(prevActQueue, prevActScopeDepth);
			0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
				didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"));
			}), ReactSharedInternals.actQueue = null);
			if (0 < ReactSharedInternals.thrownErrors.length) throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			return { then: function(resolve, reject) {
				didAwaitActCall = !0;
				0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue$jscomp$0, resolve, reject);
				})) : resolve(returnValue$jscomp$0);
			} };
		};
		exports.addTransitionType = addTransitionType;
		exports.cache = function(fn) {
			return function() {
				return fn.apply(null, arguments);
			};
		};
		exports.cacheSignal = function() {
			return null;
		};
		exports.captureOwnerStack = function() {
			var getCurrentStack = ReactSharedInternals.getCurrentStack;
			return null === getCurrentStack ? null : getCurrentStack();
		};
		exports.cloneElement = function(element, config, children) {
			if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
			var props = assign({}, element.props), key = element.key, owner = element._owner;
			if (null != config) {
				var JSCompiler_inline_result;
				a: {
					if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(config, "ref").get) && JSCompiler_inline_result.isReactWarning) {
						JSCompiler_inline_result = !1;
						break a;
					}
					JSCompiler_inline_result = void 0 !== config.ref;
				}
				JSCompiler_inline_result && (owner = getOwner());
				hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
				for (propName in config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
			}
			var propName = arguments.length - 2;
			if (1 === propName) props.children = children;
			else if (1 < propName) {
				JSCompiler_inline_result = Array(propName);
				for (var i = 0; i < propName; i++) JSCompiler_inline_result[i] = arguments[i + 2];
				props.children = JSCompiler_inline_result;
			}
			props = ReactElement(element.type, key, props, owner, element._debugStack, element._debugTask);
			for (key = 2; key < arguments.length; key++) validateChildKeys(arguments[key]);
			return props;
		};
		exports.createContext = function(defaultValue) {
			defaultValue = {
				$$typeof: REACT_CONTEXT_TYPE,
				_currentValue: defaultValue,
				_currentValue2: defaultValue,
				_threadCount: 0,
				Provider: null,
				Consumer: null
			};
			defaultValue.Provider = defaultValue;
			defaultValue.Consumer = {
				$$typeof: REACT_CONSUMER_TYPE,
				_context: defaultValue
			};
			defaultValue._currentRenderer = null;
			defaultValue._currentRenderer2 = null;
			return defaultValue;
		};
		exports.createElement = function(type, config, children) {
			for (var i = 2; i < arguments.length; i++) validateChildKeys(arguments[i]);
			var propName;
			i = {};
			var key = null;
			if (null != config) for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = !0, console.warn("Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform")), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
			var childrenLength = arguments.length - 2;
			if (1 === childrenLength) i.children = children;
			else if (1 < childrenLength) {
				for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++) childArray[_i] = arguments[_i + 2];
				Object.freeze && Object.freeze(childArray);
				i.children = childArray;
			}
			if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === i[propName] && (i[propName] = childrenLength[propName]);
			key && defineKeyPropWarningGetter(i, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
			(propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++) ? (childArray = Error.stackTraceLimit, Error.stackTraceLimit = 10, childrenLength = Error("react-stack-top-frame"), Error.stackTraceLimit = childArray) : childrenLength = unknownOwnerDebugStack;
			return ReactElement(type, key, i, getOwner(), childrenLength, propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
		};
		exports.createRef = function() {
			var refObject = { current: null };
			Object.seal(refObject);
			return refObject;
		};
		exports.forwardRef = function(render) {
			null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).") : "function" !== typeof render ? console.error("forwardRef requires a render function but was given %s.", null === render ? "null" : typeof render) : 0 !== render.length && 2 !== render.length && console.error("forwardRef render functions accept exactly two parameters: props and ref. %s", 1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
			null != render && null != render.defaultProps && console.error("forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?");
			var elementType = {
				$$typeof: REACT_FORWARD_REF_TYPE,
				render
			}, ownName;
			Object.defineProperty(elementType, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
				}
			});
			return elementType;
		};
		exports.isValidElement = isValidElement;
		exports.lazy = function(ctor) {
			ctor = {
				_status: -1,
				_result: ctor
			};
			var lazyType = {
				$$typeof: REACT_LAZY_TYPE,
				_payload: ctor,
				_init: lazyInitializer
			}, ioInfo = {
				name: "lazy",
				start: -1,
				end: -1,
				value: null,
				owner: null,
				debugStack: Error("react-stack-top-frame"),
				debugTask: console.createTask ? console.createTask("lazy()") : null
			};
			ctor._ioInfo = ioInfo;
			lazyType._debugInfo = [{ awaited: ioInfo }];
			return lazyType;
		};
		exports.memo = function(type, compare) {
			type ?? console.error("memo: The first argument must be a component. Instead received: %s", null === type ? "null" : typeof type);
			compare = {
				$$typeof: REACT_MEMO_TYPE,
				type,
				compare: void 0 === compare ? null : compare
			};
			var ownName;
			Object.defineProperty(compare, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
				}
			});
			return compare;
		};
		exports.startTransition = startTransition;
		exports.unstable_useCacheRefresh = function() {
			return resolveDispatcher().useCacheRefresh();
		};
		exports.use = function(usable) {
			return resolveDispatcher().use(usable);
		};
		exports.useActionState = function(action, initialState, permalink) {
			return resolveDispatcher().useActionState(action, initialState, permalink);
		};
		exports.useCallback = function(callback, deps) {
			return resolveDispatcher().useCallback(callback, deps);
		};
		exports.useContext = function(Context) {
			var dispatcher = resolveDispatcher();
			Context.$$typeof === REACT_CONSUMER_TYPE && console.error("Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?");
			return dispatcher.useContext(Context);
		};
		exports.useDebugValue = function(value, formatterFn) {
			return resolveDispatcher().useDebugValue(value, formatterFn);
		};
		exports.useDeferredValue = function(value, initialValue) {
			return resolveDispatcher().useDeferredValue(value, initialValue);
		};
		exports.useEffect = function(create, deps) {
			create ?? console.warn("React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useEffect(create, deps);
		};
		exports.useEffectEvent = function(callback) {
			return resolveDispatcher().useEffectEvent(callback);
		};
		exports.useId = function() {
			return resolveDispatcher().useId();
		};
		exports.useImperativeHandle = function(ref, create, deps) {
			return resolveDispatcher().useImperativeHandle(ref, create, deps);
		};
		exports.useInsertionEffect = function(create, deps) {
			create ?? console.warn("React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useInsertionEffect(create, deps);
		};
		exports.useLayoutEffect = function(create, deps) {
			create ?? console.warn("React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useLayoutEffect(create, deps);
		};
		exports.useMemo = function(create, deps) {
			return resolveDispatcher().useMemo(create, deps);
		};
		exports.useOptimistic = function(passthrough, reducer) {
			return resolveDispatcher().useOptimistic(passthrough, reducer);
		};
		exports.useReducer = function(reducer, initialArg, init) {
			return resolveDispatcher().useReducer(reducer, initialArg, init);
		};
		exports.useRef = function(initialValue) {
			return resolveDispatcher().useRef(initialValue);
		};
		exports.useState = function(initialState) {
			return resolveDispatcher().useState(initialState);
		};
		exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
			return resolveDispatcher().useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
		};
		exports.useTransition = function() {
			return resolveDispatcher().useTransition();
		};
		exports.version = "19.3.0";
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
	})();
}));
(/* @__PURE__ */ __commonJSMin(((exports, module) => {
	if (process.env.NODE_ENV === "production") module.exports = require_react_production$1();
	else module.exports = require_react_development$1();
})))();
/** Zahnreihenfolge, wie sie im HKP-Formular von links nach rechts erscheint. */
var OBERKIEFER$1 = [
	"18",
	"17",
	"16",
	"15",
	"14",
	"13",
	"12",
	"11",
	"21",
	"22",
	"23",
	"24",
	"25",
	"26",
	"27",
	"28"
];
var UNTERKIEFER$1 = [
	"48",
	"47",
	"46",
	"45",
	"44",
	"43",
	"42",
	"41",
	"31",
	"32",
	"33",
	"34",
	"35",
	"36",
	"37",
	"38"
];
var ALLE_ZAEHNE$1 = [...OBERKIEFER$1, ...UNTERKIEFER$1];
/** Verblendbereich nach Festzuschuss-Richtlinie: 15–25 und 34–44 */
var VERBLEND = /* @__PURE__ */ new Set([
	"15",
	"14",
	"13",
	"12",
	"11",
	"21",
	"22",
	"23",
	"24",
	"25",
	"34",
	"33",
	"32",
	"31",
	"41",
	"42",
	"43",
	"44"
]);
var imVerblendbereich = (zahn) => VERBLEND.has(zahn);
var istWeisheitszahn$1 = (zahn) => zahn.endsWith("8");
var istFrontzahn$1 = (zahn) => [
	"1",
	"2",
	"3"
].includes(zahn[1]);
var kieferVon$1 = (zahn) => zahn[0] === "1" || zahn[0] === "2" ? "OK" : "UK";
var BEFUND_KUERZEL = {
	a: "Adhäsivbrücke (Anker)",
	ab: "Adhäsivbrücke (Brückenglied)",
	abw: "erneuerungsbedürftige Adhäsivbrücke (Brückenglied)",
	aw: "erneuerungsbedürftige Adhäsivbrücke (Anker)",
	b: "Brückenglied",
	bw: "erneuerungsbedürftiges Brückenglied",
	e: "ersetzter Zahn",
	ew: "ersetzter, aber erneuerungsbedürftiger Zahn",
	f: "fehlender Zahn",
	i: "Implantat ohne Suprakonstruktion",
	ix: "zu entfernendes Implantat",
	k: "klinisch intakte Krone",
	kw: "erneuerungsbedürftige Krone",
	pkw: "erneuerungsbedürftige Teilkrone",
	pw: "erhaltungswürdiger Zahn mit partiellen Substanzdefekten",
	r: "Wurzelstiftkappe mit ersetztem Zahn",
	rw: "erneuerungsbedürftige Wurzelstiftkappe",
	sb: "implantatgetragenes Brückenglied",
	sbw: "erneuerungsbedürftiges implantatgetragenes Brückenglied",
	se: "ersetzter Zahn einer implantatgetragenen (Teil-)Prothese",
	sew: "erneuerungsbedürftiger ersetzter Zahn einer implantatgetragenen Prothese",
	sk: "implantatgetragene intakte Krone",
	skw: "erneuerungsbedürftige implantatgetragene Krone",
	so: "implantatgetragenes Verbindungselement mit ersetztem Zahn",
	sow: "erneuerungsbedürftiges implantatgetragenes Verbindungselement",
	st: "implantatgetragene Teleskopkrone",
	stw: "erneuerungsbedürftige implantatgetragene Teleskopkrone",
	t: "Teleskopkrone",
	t2w: "erneuerungsbedürftiges Sekundärteil einer Teleskopkrone",
	tw: "erneuerungsbedürftige Teleskopkrone",
	ur: "unzureichende Retention",
	ww: "erhaltungswürdiger Zahn mit weitgehender Zerstörung",
	x: "nicht erhaltungswürdiger Zahn",
	")(": "Lückenschluss"
};
/** Befundkürzel, die einen fehlenden oder zu ersetzenden Zahn bedeuten */
var FEHLEND = /* @__PURE__ */ new Set([
	"f",
	"x",
	"b",
	"bw",
	"e",
	"ew",
	"ab",
	"abw",
	"sb",
	"sbw",
	"se",
	"sew",
	"r",
	"rw",
	"so",
	"sow"
]);
/** davon versorgungsbedürftig (lösen eine Neuversorgung aus) */
var VERSORGUNG_NOETIG = /* @__PURE__ */ new Set([
	"f",
	"x",
	"bw",
	"ew",
	"abw"
]);
/** Befunde, die eine Krone des Zahnes erfordern */
var KRONE_NOETIG = /* @__PURE__ */ new Set([
	"ww",
	"kw",
	"aw",
	"ur"
]);
var TEILKRONE_NOETIG = /* @__PURE__ */ new Set(["pw", "pkw"]);
//#endregion
//#region ../HKP/src/engine/bruecken.ts
var GLIED$3 = /^(S?B|AB)[VM]?$/;
var PFEILER$1 = /^(S?K|PK|S?T|A$)/;
/** Befundkürzel tragen keinen Brückenstrich. „K-“ ist die Krone k. */
var befundOhneStrich = (code) => code.trim().toLowerCase().replace(/^-+|-+$/g, "");
/**
* Brücken eines Kiefers in Zahnreihenfolge (18…28 bzw. 48…38): zuerst die mit „-“ markierten Bereiche,
* dann je Lauf von Brückengliedern außerhalb davon die angrenzenden Pfeiler.
* Je zwei Markierungen begrenzen eine Brücke, gleich auf welcher Seite des Kürzels der Strich steht;
* „-K-“ ist der gemeinsame Pfeiler zweier Brücken.
*/
function brueckenBereiche$1(reihe, kuerzel, marke) {
	const out = [];
	let start = -1;
	reihe.forEach((z, i) => {
		const m = marke(z);
		if (!m?.bAnfang && !m?.bEnde) return;
		if (start < 0) {
			start = i;
			return;
		}
		out.push({
			zaehne: reihe.slice(start, i + 1),
			explizit: true
		});
		start = m.bAnfang && m.bEnde ? i : -1;
	});
	const markiert = new Set(out.flatMap((b) => b.zaehne));
	let akt = [];
	const abschliessen = () => {
		if (!akt.length) return;
		const links = reihe[akt[0] - 1];
		const rechts = reihe[akt[akt.length - 1] + 1];
		const zaehne = akt.map((i) => reihe[i]);
		out.push({
			zaehne: [
				...links && PFEILER$1.test(kuerzel(links)) ? [links] : [],
				...zaehne,
				...rechts && PFEILER$1.test(kuerzel(rechts)) ? [rechts] : []
			],
			explizit: false
		});
		akt = [];
	};
	reihe.forEach((z, i) => {
		if (GLIED$3.test(kuerzel(z)) && !markiert.has(z)) akt.push(i);
		else abschliessen();
	});
	abschliessen();
	return out;
}
/** Pfeiler einer explizit markierten Brücke: alle Kronen im Bereich (auch Doppelanker ohne angrenzendes Glied) */
var pfeilerIm$1 = (b, kuerzel) => b.zaehne.filter((z) => PFEILER$1.test(kuerzel(z)));
//#endregion
//#region ../HKP/src/mandant.ts
var LISTE_KEY = "planr.mandanten.v1";
var AKTIV_KEY = "planr.mandant.v1";
/** Der Standard-Mandant liest die alten Schlüssel ohne Zusatz – vorhandene Daten bleiben ihm erhalten. */
var STANDARD_ID = "standard";
var STANDARD = {
	id: STANDARD_ID,
	name: "Praxis"
};
var speicher = () => typeof localStorage === "undefined" ? null : localStorage;
function kennung$1(text) {
	return text.toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
/** Speicherschlüssel eines Mandanten */
var schluessel = (key, mandantId) => mandantId === "standard" ? key : `${key}@${mandantId}`;
function lesen() {
	let liste = [];
	try {
		const roh = JSON.parse(speicher()?.getItem(LISTE_KEY) ?? "[]");
		if (Array.isArray(roh)) liste = roh.filter((m) => m && typeof m.id === "string" && kennung$1(m.id) === m.id && m.id);
	} catch {
		liste = [];
	}
	return [liste.find((m) => m.id === "standard") ?? STANDARD, ...liste.filter((m) => m.id !== STANDARD_ID)].map((m) => ({
		id: m.id,
		name: String(m.name || m.id)
	}));
}
var schreiben = (liste) => speicher()?.setItem(LISTE_KEY, JSON.stringify(liste));
/** Aktiver Mandant beim Laden der Seite; ?mandant=kürzel wählt (und legt bei Bedarf an). */
function starten() {
	const liste = lesen();
	let id = speicher()?.getItem(AKTIV_KEY) ?? "standard";
	const aufruf = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("mandant");
	if (aufruf && kennung$1(aufruf)) {
		id = kennung$1(aufruf);
		if (!liste.some((m) => m.id === id)) {
			liste.push({
				id,
				name: aufruf.trim()
			});
			schreiben(liste);
		}
		speicher()?.setItem(AKTIV_KEY, id);
	}
	return {
		liste,
		aktiv: liste.find((m) => m.id === id) ?? liste[0]
	};
}
/** Gilt für die ganze Sitzung; ein Wechsel lädt die Seite neu, damit alle Speicher den neuen Mandanten lesen. */
var MANDANT_ID = starten().aktiv.id;
var mk = (key) => schluessel(key, MANDANT_ID);
//#endregion
//#region ../HKP/src/stammdaten.ts
var leererPatient$1 = () => ({
	anrede: "",
	titel: "",
	vorname: "",
	name: "",
	geburtsdatum: "",
	strasse: "",
	plz: "",
	ort: "",
	kasse: "",
	kassenNr: "",
	versichertenNr: "",
	status: "",
	kassenart: "primaer",
	email: ""
});
mk("hkp.plan.v1");
function leererPlan() {
	return {
		patient: leererPatient$1(),
		verwaltung: {
			lfdNr: "",
			eingliederungsdatum: "",
			herstellungsortEingliederung: "",
			antragsnummer: "",
			art: "HKP",
			therapieschritt: "",
			therapieschritteGesamt: "",
			ausstellungsdatum: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
			herstellungsort: "",
			abrechnungsNr: "",
			zahnarztNr: "",
			antragsnummerUrspruenglich: "",
			aktenzeichen: "",
			erlaeuterung: ""
		},
		zaehne: Object.fromEntries(ALLE_ZAEHNE$1.map((z) => [z, {
			B: "",
			R: "",
			TP: ""
		}])),
		bemerkungen: "",
		weitere: {
			unfall: false,
			ser: false,
			immediatOK: false,
			immediatUK: false,
			interimOK: false,
			interimUK: false,
			unbrauchbarOK: false,
			unbrauchbarUK: false,
			alterOK: "",
			alterUK: "",
			nem: false,
			direktabrechnung: false
		},
		klinisch: {
			stiftKonfektioniert: [],
			stiftGegossen: [],
			stiftAdhaesiv: [],
			stiftNachtraeglich: [],
			disparallel: [],
			metallbasisOK: false,
			metallbasisUK: false,
			stuetzstift: false,
			atrophieOK: false,
			atrophieUK: false
		},
		reparaturen: [],
		abformung: "",
		abformungProthese: "",
		implantat: {
			system: "durchschnitt",
			abformung: "",
			abutment: "standard"
		},
		werkstoffe: {},
		befunde: [],
		positionen: [],
		ausgeschlossen: [],
		zuschuss: {
			bonus: "60",
			haertefall: false
		},
		versorgungsart: "auto",
		fremdlabor: {
			name: "",
			auftragsnummer: "",
			laufendeNr: 1
		},
		einstellungen: {
			bemaListe: "auto",
			gozListe: "goz-2012",
			belListe: "auto",
			bebListe: "beb-itz-2024",
			fzListe: "auto",
			kzv: "",
			labor: "gewerbe",
			mwstLabor: 7,
			gozFaktor: 2.3,
			honorarFaktor: 0,
			gozZusatzStufe: 0,
			gozZusatzAus: [],
			eigenKasseProzent: 100,
			eigenPrivatAufschlag: 0,
			eigenPrivatStufe: 0,
			eigenPrivatTp: {},
			eigenPrivatAus: [],
			praxisPlz: ""
		}
	};
}
//#endregion
//#region ../HKP/src/engine/kombinationen.ts
var REIHE$1 = [...OBERKIEFER$1, ...UNTERKIEFER$1];
var kieferVonZahn = (z) => z[0] === "1" || z[0] === "2" ? "OK" : "UK";
/** Zähne und Kiefer aus einer Angabe wie „15-13“, „16“, „15,13,14“, „OK“ oder „OK,UK“ */
function gebietAufloesen(gebiet) {
	const zaehne = [];
	const kiefer = /* @__PURE__ */ new Set();
	for (const teil of gebiet.split(/[,;\s]+/).filter(Boolean)) {
		const t = teil.toUpperCase();
		if (t === "OK" || t === "UK") {
			kiefer.add(t);
			continue;
		}
		const m = /^(\d{2})-(\d{2})$/.exec(teil);
		if (m) {
			const a = REIHE$1.indexOf(m[1]);
			const b = REIHE$1.indexOf(m[2]);
			if (a >= 0 && b >= 0 && kieferVonZahn(m[1]) === kieferVonZahn(m[2])) {
				zaehne.push(...REIHE$1.slice(Math.min(a, b), Math.max(a, b) + 1));
				continue;
			}
		}
		if (REIHE$1.includes(teil)) zaehne.push(teil);
	}
	for (const z of zaehne) kiefer.add(kieferVonZahn(z));
	return {
		zaehne,
		kiefer
	};
}
//#endregion
//#region ../HKP/src/engine/reparaturen.ts
/**
* Wiederherstellungen und Erweiterungen nach den Berechnungsbeispielen des KZBV-Kompendiums
* (Befundklasse 6, 7.3, 7.4, 7.7). Bei Wiederherstellungen bleibt Zeile B leer.
*/
var REPARATUR_ARTEN = [
	{
		id: "6.0",
		titel: "Prothese: Wiederherstellung ohne Abformung und ohne Labor (z. B. Klammer aktivieren)",
		gruppe: "Prothese",
		je: "kiefer",
		honorar: () => [[
			"BEMA",
			"100a",
			1
		]],
		labor: () => [],
		befunde: () => [["6.0", 1]]
	},
	{
		id: "6.1",
		titel: "Prothese: Reparatur ohne Abformung (z. B. Sprung)",
		gruppe: "Prothese",
		je: "kiefer",
		honorar: () => [[
			"BEMA",
			"100a",
			1
		]],
		labor: () => [[
			"BEL",
			"8010",
			1
		], [
			"BEL",
			"8021",
			1
		]],
		befunde: () => [["6.1", 1]]
	},
	{
		id: "6.2",
		titel: "Prothese: Reparatur mit Abformung, Kunststoffbereich (z. B. Bruch)",
		gruppe: "Prothese",
		je: "kiefer",
		honorar: () => [[
			"BEMA",
			"100b",
			1
		]],
		labor: () => [
			[
				"BEL",
				"0010",
				1
			],
			[
				"BEL",
				"8010",
				1
			],
			[
				"BEL",
				"8022",
				1
			]
		],
		befunde: () => [["6.2", 1]]
	},
	{
		id: "6.3",
		titel: "Prothese: Reparatur im gegossenen Metallbereich (z. B. Klammer, Halteelement)",
		gruppe: "Prothese",
		je: "kiefer",
		honorar: () => [[
			"BEMA",
			"100b",
			1
		]],
		labor: () => [
			[
				"BEL",
				"0010",
				1
			],
			[
				"BEL",
				"8010",
				1
			],
			[
				"BEL",
				"8070",
				1
			]
		],
		befunde: () => [["6.3", 1]]
	},
	{
		id: "6.4",
		titel: "Prothese erweitern, Kunststoffbereich (Zähne angeben)",
		gruppe: "Prothese",
		je: "zahn",
		honorar: () => [[
			"BEMA",
			"100b",
			1
		]],
		labor: (n) => [
			[
				"BEL",
				"0010",
				1
			],
			[
				"BEL",
				"8010",
				1
			],
			[
				"BEL",
				"8023",
				n
			]
		],
		befunde: (n) => [["6.4", 1], ...n > 1 ? [["6.4.1", n - 1]] : []]
	},
	{
		id: "6.5",
		titel: "Prothese erweitern, gegossener Metallbereich (Zähne angeben)",
		gruppe: "Prothese",
		je: "zahn",
		honorar: () => [[
			"BEMA",
			"100b",
			1
		]],
		labor: (n) => [
			[
				"BEL",
				"0010",
				1
			],
			[
				"BEL",
				"8010",
				1
			],
			[
				"BEL",
				"8023",
				n
			],
			[
				"BEL",
				"8070",
				1
			]
		],
		befunde: (n) => [["6.5", 1], ...n > 1 ? [["6.5.1", n - 1]] : []],
		hinweis: "Neue gegossene Halte- und Stützvorrichtung ggf. mit BEMA 98h ergänzen."
	},
	{
		id: "6.6",
		titel: "Teilprothese unterfüttern (verändertes Prothesenlager)",
		gruppe: "Prothese",
		je: "kiefer",
		honorar: () => [[
			"BEMA",
			"100d",
			1
		]],
		labor: () => [[
			"BEL",
			"0010",
			1
		], [
			"BEL",
			"8090",
			1
		]],
		befunde: () => [["6.6", 1]]
	},
	{
		id: "6.7",
		titel: "Totalprothese/Deckprothese unterfüttern mit funktioneller Randgestaltung",
		gruppe: "Prothese",
		je: "kiefer",
		honorar: (_, k) => [[
			"BEMA",
			k === "OK" ? "100e" : "100f",
			1
		]],
		labor: () => [[
			"BEL",
			"0010",
			1
		], [
			"BEL",
			"8090",
			1
		]],
		befunde: () => [["6.7", 1]]
	},
	{
		id: "6.8-krone",
		titel: "Krone wiedereinsetzen (je Zahn)",
		gruppe: "Festsitzend",
		je: "zahn",
		honorar: (n) => [[
			"BEMA",
			"24a",
			n
		]],
		labor: () => [],
		befunde: (n) => [["6.8", n]]
	},
	{
		id: "6.8-bruecke",
		titel: "Brücke wiedereinsetzen (Brückenanker angeben)",
		gruppe: "Festsitzend",
		je: "zahn",
		honorar: (n) => [[
			"BEMA",
			n > 2 ? "95b" : "95a",
			1
		]],
		labor: () => [],
		befunde: (n) => [["6.8", n]]
	},
	{
		id: "6.8.1",
		titel: "Adhäsivbrücke wiederbefestigen (je Flügel)",
		gruppe: "Festsitzend",
		je: "zahn",
		honorar: () => [],
		labor: (n) => [[
			"BEL",
			"1550",
			n
		]],
		befunde: (n) => [["6.8.1", n]],
		hinweis: "Adhäsivbrücke wiederbefestigen: zahnärztliche Leistung bitte ergänzen."
	},
	{
		id: "6.9-krone",
		titel: "Facette/Verblendung an Krone oder Sekundärteleskop erneuern (Verblendbereich)",
		gruppe: "Festsitzend",
		je: "zahn",
		honorar: (n) => [[
			"BEMA",
			"24b",
			n
		]],
		labor: (n) => [[
			"BEL",
			"8200",
			n
		], [
			"BEL",
			"1620",
			n
		]],
		befunde: (n) => [["6.9", n]]
	},
	{
		id: "6.9-bruecke",
		titel: "Facette/Verblendung an Brückenanker oder -glied erneuern (Verblendbereich)",
		gruppe: "Festsitzend",
		je: "zahn",
		honorar: (n) => [[
			"BEMA",
			"95c",
			n
		]],
		labor: (n) => [[
			"BEL",
			"8200",
			n
		], [
			"BEL",
			"1620",
			n
		]],
		befunde: (n) => [["6.9", n]]
	},
	{
		id: "7.3",
		titel: "Implantatkrone: Facette/Verblendung wiederherstellen",
		gruppe: "Implantat",
		je: "zahn",
		honorar: (n) => [[
			"GOZ",
			"2320",
			n
		]],
		labor: (n) => [[
			"BEB",
			"8201",
			n
		], [
			"BEB",
			"2611",
			n
		]],
		befunde: (n) => [["7.3", n]],
		hinweis: "Implantatkrone: GOZ statt BEMA; im Ausnahmefall nach Nr. 36 ZE-Richtlinie BEMA 24b (i)."
	},
	{
		id: "7.4",
		titel: "Implantatkrone/-brückenanker wiedereingliedern",
		gruppe: "Implantat",
		je: "zahn",
		honorar: (n) => [[
			"GOZ",
			"2310",
			n
		]],
		labor: () => [],
		befunde: (n) => [["7.4", n]],
		hinweis: "Implantatkrone: GOZ statt BEMA; im Ausnahmefall nach Nr. 36 ZE-Richtlinie BEMA 24a (i)."
	},
	{
		id: "7.7",
		titel: "Implantatgetragene Prothese wiederherstellen",
		gruppe: "Implantat",
		je: "kiefer",
		honorar: () => [[
			"GOZ",
			"5260",
			1
		]],
		labor: () => [[
			"BEB",
			"8011",
			1
		], [
			"BEB",
			"8022",
			1
		]],
		befunde: () => [["7.7", 1]],
		hinweis: "Implantatgetragene Prothese: GOZ statt BEMA; im Ausnahmefall nach Nr. 36 ZE-Richtlinie BEMA 100a/100b (i)."
	}
];
var reparaturArt = (id) => REPARATUR_ARTEN.find((a) => a.id === id);
/** Festzuschuss-Befunde und Leistungen aller eingetragenen Wiederherstellungen */
function reparaturenAnwenden(reparaturen) {
	const befunde = [];
	const positionen = [];
	const hinweise = [];
	reparaturen.forEach((r, i) => {
		const art = reparaturArt(r.art);
		if (!art) return;
		const { zaehne, kiefer } = gebietAufloesen(r.gebiet);
		if (!kiefer.size) {
			hinweise.push(`Wiederherstellung „${art.titel}“: bitte ${art.je === "kiefer" ? "Kiefer (OK/UK)" : "Zähne"} angeben.`);
			return;
		}
		if (art.je === "zahn" && !zaehne.length) {
			hinweise.push(`Wiederherstellung „${art.titel}“: bitte die betroffenen Zähne angeben.`);
			return;
		}
		const k = [...kiefer][0];
		const gebiet = art.je === "kiefer" ? k : [...zaehne].sort((x, y) => ALLE_ZAEHNE$1.indexOf(x) - ALLE_ZAEHNE$1.indexOf(y)).join(",");
		const n = art.je === "kiefer" ? 1 : zaehne.length;
		let j = 0;
		const pos = ([ebene, nr, anzahl]) => ({
			id: `rep-${i}-${j++}`,
			ebene,
			nr,
			zahn: gebiet,
			anzahl,
			auto: true
		});
		for (const [nr, anzahl] of art.befunde(n)) befunde.push({
			id: `rep-${i}-b${nr}`,
			nr,
			zahnGebiet: gebiet,
			anzahl,
			auto: true
		});
		positionen.push(...art.honorar(n, k).map(pos), ...art.labor(n).map(pos));
		if (art.hinweis) hinweise.push(art.hinweis);
	});
	return {
		befunde,
		positionen,
		hinweise
	};
}
//#endregion
//#region ../HKP/src/data/implantatsysteme.ts
var KOMPONENTEN$1 = {
	abdruckpfosten: "Abformpfosten",
	scanbody: "Scanbody",
	laboranalog: "Laboranalog",
	abutmentStandard: "Abutment konfektioniert (Titan)",
	tiBase: "Klebebasis / Ti-Base",
	schraube: "Prothetikschraube"
};
var sys$1 = (id, hersteller, system, preise, quelle, stand, genau) => ({
	id,
	hersteller,
	system,
	preise,
	quelle,
	stand,
	genau
});
var p$1 = (abdruckpfosten, scanbody, laboranalog, abutmentStandard, tiBase, schraube) => ({
	abdruckpfosten,
	scanbody,
	laboranalog,
	abutmentStandard,
	tiBase,
	schraube
});
/** Listenpreise netto laut Herstellerkatalogen; „geschaetzt“ = keine öffentliche Preisliste gefunden */
var SYSTEME$1 = [
	sys$1("straumann-bl", "Straumann", "Bone Level / BLT RC (BLX analog)", p$1(42, 40, 37, 156, 81, 27), "https://www.straumann.com/content/dam/media-center/straumann/de-de/documents/manual/straumann_de500248_systemuebersicht_bone_level_implantat.pdf", "2026-01", "ja"),
	sys$1("nobel-active", "Nobel Biocare", "NobelActive / NobelParallel CC RP", p$1(60, 75, 35, 175, 110, 30), "geschätzt (Preise nur mit Login)", "2026-10", "geschaetzt"),
	sys$1("astra-ev", "Dentsply Sirona", "Astra Tech Implant System EV", p$1(45, 105, 37, 142, 95, 21), "https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/32672075-DE-2209%20Prosthetics%20product%20catalog_Preisliste_2307_LR.pdf", "2023-07", "ja"),
	sys$1("ankylos", "Dentsply Sirona", "Ankylos C/X", p$1(61, 105, 37, 113, 97, 21), "https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/32671089-DE-1905%20Ankylos%20Product%20Catalog_Preisliste_2307_LR.pdf", "2023-07", "ja"),
	sys$1("xive", "Dentsply Sirona", "Xive", p$1(87, 105, 34, 109, 95, 15), "https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/32670052-DE-2006%20Xive%20Product%20Catalog_Preisliste_2307_LR.pdf", "2023-07", "teilweise"),
	sys$1("camlog", "Camlog", "CAMLOG / CONELOG", p$1(46, 37, 20, 88, 71, 17), "https://ebook.camlog.de/camlog/de/preisliste-camlog/", "2026-05", "ja"),
	sys$1("zimmer-tsv", "Zimmer Biomet", "Tapered Screw-Vent / T3", p$1(55, 70, 30, 140, 90, 25), "geschätzt", "2026-10", "geschaetzt"),
	sys$1("biohorizons", "BioHorizons", "Tapered Internal", p$1(50, 60, 28, 120, 85, 22), "geschätzt", "2026-10", "geschaetzt"),
	sys$1("bego-semados", "BEGO", "Semados S/RSX", p$1(45, 36, 26, 95, 55, 19), "https://security.bego.com/img/file/basic/me_800281_0014_so_de.pdf", "2022-06", "teilweise"),
	sys$1("bredent-copasky", "bredent medical", "copaSKY", p$1(39.9, 46, 28.9, 74, 69, 24.9), "https://bredent-group.com/wp-content/uploads/2026/02/Prospekt-copaSKY-ultrakurz_0099320D-20251106_web.pdf", "2025-12", "teilweise"),
	sys$1("champions-revolution", "Champions-Implants", "(R)Evolution", p$1(35, 25, 20, 25, 25, 7), "Preisliste 01/2012, ca. +25 % hochgerechnet", "2012-01", "teilweise"),
	sys$1("medentis-icx", "medentis medical", "ICX", p$1(39, 39, 19, 79, 39, 15), "https://medentis.com/Downloads/epaper/produktkatalog-26/", "2026", "teilweise"),
	sys$1("mis-c1", "MIS (Dentsply Sirona)", "C1 / V3 Conical Connection", p$1(56, 79, 37, 77, 79, 22), "https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/MIS%20Gesamtpreisliste%20DE%2007_2023_LR.pdf", "2023-07", "teilweise"),
	sys$1("neoss-proactive", "Neoss", "ProActive", p$1(55, 65, 30, 130, 85, 25), "geschätzt (Preise nur mit Login)", "2026-10", "geschaetzt"),
	sys$1("osstem-tsiii", "Osstem", "TSIII", p$1(40, 45, 20, 70, 50, 15), "geschätzt", "2026-10", "geschaetzt"),
	sys$1("megagen-anyridge", "MegaGen", "AnyRidge", p$1(45, 50, 22, 80, 60, 18), "geschätzt", "2026-10", "geschaetzt"),
	sys$1("thommen-element", "Thommen Medical", "SPI Element / Contact", p$1(75, 85, 35, 180, 110, 28), "geschätzt", "2026-10", "geschaetzt"),
	sys$1("sic-invent", "SIC invent", "SICace / SICmax", p$1(55, 61, 28, 90, 64, 17), "https://www.zwp-online.info/files/241578/MA150-02_DE_Produktkatalog_2025-05-30.pdf", "2025-03", "ja"),
	sys$1("dentaurum-tiologic", "Dentaurum", "tioLogic TWINFIT / ST", p$1(55, 60, 28, 110, 75, 20), "geschätzt (Preise nur mit Login)", "2026-10", "geschaetzt"),
	sys$1("implantdirect-legacy", "Implant Direct", "Legacy / InterActive", p$1(35, 40, 18, 60, 80, 15), "US-Listenpreise umgerechnet, Rest geschätzt", "2026-10", "teilweise")
];
var mittel$1 = (k) => Math.round(SYSTEME$1.reduce((s, x) => s + x.preise[k], 0) / SYSTEME$1.length);
var IMPLANTATSYSTEME$1 = [sys$1("durchschnitt", "Mittelwert", `System noch nicht gewählt (Ø aus ${SYSTEME$1.length} Systemen)`, p$1(mittel$1("abdruckpfosten"), mittel$1("scanbody"), mittel$1("laboranalog"), mittel$1("abutmentStandard"), mittel$1("tiBase"), mittel$1("schraube")), "Mittelwert der hinterlegten Systeme", "2026-10", "geschaetzt"), ...SYSTEME$1];
var implantatsystem$1 = (id) => IMPLANTATSYSTEME$1.find((s) => s.id === id) ?? IMPLANTATSYSTEME$1[0];
//#endregion
//#region ../HKP/src/engine/zusatzleistungen.ts
/** Kieferhälfte bzw. Frontzahnbereich im Sinne der GOZ (13–23 und 33–43 = Frontzahnbereich) */
function bereich$2(zahn) {
	const q = zahn[0];
	if (Number(zahn[1]) <= 3) return q === "1" || q === "2" ? "OK-Front" : "UK-Front";
	return {
		"1": "OK rechts",
		"2": "OK links",
		"3": "UK links",
		"4": "UK rechts"
	}[q] ?? q;
}
//#endregion
//#region ../HKP/src/engine/implantat.ts
/** Kürzel (TP, sonst R) einer implantatgetragenen Krone, eines Implantat-Teleskops oder -Verbindungselements (Steg, Locator) */
var IMPLANTAT_TP = /^S[KTO]|^ZAS$/;
var kuerzelVon = (v) => (v?.TP.trim() || v?.R || "").toUpperCase();
var GEGENUEBER = {
	"OK rechts": "UK rechts",
	"OK-Front": "UK-Front",
	"OK links": "UK links",
	"UK rechts": "OK rechts",
	"UK-Front": "OK-Front",
	"UK links": "OK links"
};
function implantatZaehne(zaehne) {
	return ALLE_ZAEHNE$1.filter((z) => IMPLANTAT_TP.test(kuerzelVon(zaehne[z])));
}
var zaehler$3 = 0;
function pos$3(ebene, nr, zahn, anzahl = 1, extra = {}) {
	return {
		id: `impl-${Date.now().toString(36)}-${(zaehler$3++).toString(36)}`,
		ebene,
		nr,
		zahn,
		anzahl,
		auto: true,
		...extra
	};
}
/**
* Prothetische Implantatleistungen je Implantatkrone: GOZ 9050 (Abformung und Eingliederung),
* Abformung je nach Art (Scan / offener / geschlossener Löffel), Labor (Implantatmodell, Zahnfleischmaske,
* Abutment) und die Implantatteile des gewählten Systems als Material.
* `teileLabor`: wer die Teile berechnet ('fremd' = Laborrechnung, sonst Praxismaterial).
*/
function implantatPositionen(zaehne, a, teileLabor) {
	const imp = implantatZaehne(zaehne);
	if (!imp.length) return {
		positionen: [],
		hinweise: []
	};
	const sys = implantatsystem$1(a.system);
	const positionen = [];
	const hinweise = [];
	const kiefer = [...new Set(imp.map(kieferVon$1))];
	const haelften = [...new Set(imp.map(bereich$2))];
	const mat = (k, zahn) => pos$3("MAT", "", zahn, 1, {
		text: `${sys.hersteller} ${sys.system}: ${KOMPONENTEN$1[k]}`,
		preis: sys.preise[k],
		rolle: `implantat-${k}`,
		...teileLabor ? { labor: teileLabor } : {}
	});
	for (const z of imp) positionen.push(pos$3("GOZ", "9050", z, 2));
	if (a.abformung === "scan") {
		const regionen = [.../* @__PURE__ */ new Set([...haelften, ...haelften.map((h) => GEGENUEBER[h])])];
		for (const r of regionen) positionen.push(pos$3("GOZ", "0065", r));
		for (const k of kiefer) positionen.push(pos$3("BEB", "0009", k), pos$3("BEB", "0018", k));
		for (const z of imp) positionen.push(pos$3("BEB", "0224", z), mat("scanbody", z), mat("laboranalog", z));
	} else if (a.abformung) {
		if (a.abformung === "offen") for (const k of kiefer) positionen.push(pos$3("GOZ", "5170", k), pos$3("BEB", "1108", k));
		for (const k of kiefer) positionen.push(pos$3("BEB", "0018", k));
		for (const z of imp) positionen.push(pos$3("BEB", "0225", z), mat("abdruckpfosten", z), mat("laboranalog", z));
	} else hinweise.push(`Implantatkrone ${imp.join(", ")}: Abformung (Intraoralscan oder offener/geschlossener Löffel) noch nicht festgelegt – Abformleistungen und Abformteile fehlen.`);
	for (const h of haelften) positionen.push(pos$3("BEB", "0223", h));
	for (const z of imp) if (a.abutment === "standard" || kuerzelVon(zaehne[z]) === "SO") positionen.push(pos$3("BEB", "4421", z), mat("abutmentStandard", z));
	else positionen.push(pos$3("BEB", a.abutment === "keramik" ? "6906" : "2033", z), mat("tiBase", z), mat("schraube", z));
	if (sys.genau !== "ja") hinweise.push(`Implantatteile ${sys.hersteller} ${sys.system}: Preise ${sys.genau === "teilweise" ? "teilweise " : ""}geschätzt (${sys.stand}) – mit der aktuellen Preisliste bzw. Laborrechnung abgleichen.`);
	hinweise.push("Chirurgische Implantatleistungen (GOZ 9000–9040, Augmentation) gehören nicht in den HKP und sind gesondert zu planen.");
	return {
		positionen,
		hinweise
	};
}
//#endregion
//#region ../HKP/src/engine/digital.ts
/**
* Eigenlabor-Schritte des digitalen Workflows ohne BEB-Entsprechung. Den Ablauf nach Intraoralscan
* (Oralscan, CAD, Druckstumpf, Sintern …) plant abformung.ts mit den BEB-Standardpositionen;
* D101–D103 bleiben nur, damit ältere Pläne ihren Preis behalten. D106–D108: digitale Totalprothese.
*/
var DIGITAL$1 = {
	daten: "D101",
	stumpf: "D102",
	artikulation: "D103",
	scanbody: "D104",
	anprobe: "D105",
	aufstellung: "D106",
	einsetzen: "D107",
	anprobeProthese: "D108"
};
var DIGITAL_KATALOG$1 = [
	{
		nr: DIGITAL$1.daten,
		text: "Intraoralscan-Daten übernehmen, auf Vollständigkeit prüfen und für die Konstruktion aufbereiten (je Auftrag)",
		preis: 14
	},
	{
		nr: DIGITAL$1.stumpf,
		text: "Virtueller Stumpf: segmentieren, Präparationsgrenze festlegen, Zementspalt definieren (je Stumpf)",
		preis: 6.5
	},
	{
		nr: DIGITAL$1.artikulation,
		text: "Virtuelle Artikulation: Kieferrelation über Bukkalscan zuordnen, Okklusion im virtuellen Artikulator einstellen (je Auftrag)",
		preis: 14.5
	},
	{
		nr: DIGITAL$1.scanbody,
		text: "Scanbody-Matching: Implantatposition aus der Herstellerbibliothek zuordnen und prüfen (je Implantat)",
		preis: 9.5
	},
	{
		nr: DIGITAL$1.anprobe,
		text: "Anprobe gedruckt (Try-in aus Kunststoff) zur Passungs- und Ästhetikkontrolle (je Einheit)",
		preis: 9.5
	},
	{
		nr: DIGITAL$1.aufstellung,
		text: "CAD: Prothesenzähne virtuell aufstellen, Okklusion und Basis konstruieren (je Kiefer)",
		preis: 65
	},
	{
		nr: DIGITAL$1.einsetzen,
		text: "Prothesenzähne in die gefräste bzw. gedruckte Basis einsetzen, ausarbeiten und polieren (je Kiefer)",
		preis: 55
	},
	{
		nr: DIGITAL$1.anprobeProthese,
		text: "Anprobeprothese gedruckt (Try-in der CAD-Aufstellung, je Kiefer)",
		preis: 45
	}
];
/** BEB-Positionen des digitalen Ablaufs nach Intraoralscan (Standardpositionen jeder BEB-Liste) */
var DIGITAL_BEB$1 = {
	oralscan: "0007",
	praepFreilegen: "0013",
	druckstumpf: "0017",
	sintern: "0032",
	auftragsdaten: "0901",
	registrierung: "0902",
	segmentierung: "0903",
	segment: "0904",
	praepgrenze: "0905",
	glanzbrand: "0906",
	krone: "0907",
	glied: "0908",
	kauflaeche: "0909",
	verbinder: "0910",
	nacharbeiten: "0911"
};
DIGITAL$1.daten, DIGITAL$1.stumpf, DIGITAL$1.artikulation;
//#endregion
//#region ../HKP/src/engine/material.ts
var WERKSTOFFE$1 = {
	nem: {
		titel: "NEM-Legierung (Kobalt-Chrom)",
		kurz: "NEM",
		art: "metall",
		preis: .85,
		dichte: .5,
		quelle: "Wirobond C/SG/280, Remanium 2000+/2001: 0,58–1,00 €/g"
	},
	goldreduziert: {
		titel: "Goldreduzierte Edelmetalllegierung",
		kurz: "Gold reduziert",
		art: "metall",
		preis: 105,
		dichte: .82,
		quelle: "C.Hafner Aurumed, DiGOLD Nettogold, Wegold Eco-SG: 86–114 €/g"
	},
	hochgold: {
		titel: "Hochgoldlegierung (Au ≥ 75 %)",
		kurz: "Hochgold",
		art: "metall",
		preis: 140,
		dichte: 1,
		quelle: "Tagespreise Trendgold, DiGOLD, Wegold, C.Hafner, Goldquadrat: 113–166 €/g (Feingold ca. 119 €/g)"
	},
	zirkon: {
		titel: "Zirkonoxid",
		kurz: "Zirkon",
		art: "keramik",
		preis: 15,
		quelle: "Multilayer-Ronden 85–205 € netto, anteilig 12–18 € je Einheit"
	},
	presskeramik: {
		titel: "Presskeramik (Lithiumdisilikat, z. B. e.max Press)",
		kurz: "Presskeramik",
		art: "keramik",
		preis: 17.5,
		quelle: "IPS e.max Press Rohling 15,29–19,47 € je Stück"
	},
	lithiumdisilikat: {
		titel: "Lithiumdisilikat gefräst (z. B. e.max CAD)",
		kurz: "LiSi CAD",
		art: "keramik",
		preis: 29.5,
		quelle: "IPS e.max CAD Block 28,47–30,67 € je Stück"
	}
};
/** Laborpositionen, die eine Einheit mit Legierung bzw. Keramik festlegen */
var EINHEITEN$1 = {
	"BEL 1021": {
		art: "metall",
		einheit: "krone"
	},
	"BEL 1022": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEL 1024": {
		art: "metall",
		einheit: "verblendkrone"
	},
	"BEL 1100": {
		art: "metall",
		einheit: "glied"
	},
	"BEL 1200": {
		art: "metall",
		einheit: "teleskop"
	},
	"BEL 1201": {
		art: "metall",
		einheit: "sekundaerteleskop"
	},
	"BEB 2101": {
		art: "metall",
		einheit: "krone"
	},
	"BEB 2104": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2121": {
		art: "metall",
		einheit: "verblendkrone"
	},
	"BEB 2126": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2155": {
		art: "metall",
		einheit: "anker"
	},
	"BEB 2362": {
		art: "metall",
		einheit: "glied"
	},
	"BEB 3001": {
		art: "metall",
		einheit: "teleskop"
	},
	"BEB 2281": {
		art: "keramik",
		einheit: "krone"
	},
	"BEB 2251": {
		art: "keramik",
		einheit: "krone"
	},
	"BEB 2252": {
		art: "keramik",
		einheit: "krone"
	},
	"BEB 2301": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2302": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2303": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2304": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2551": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2552": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2553": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2554": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2351": {
		art: "keramik",
		einheit: "glied"
	},
	"BEB 2352": {
		art: "keramik",
		einheit: "glied"
	},
	"BEB 2361": {
		art: "keramik",
		einheit: "glied"
	},
	"BEB 2534": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2653": {
		art: "keramik",
		einheit: "veneer"
	}
};
var WERKSTOFFE_FUER$1 = {
	metall: [
		"nem",
		"goldreduziert",
		"hochgold"
	],
	keramik: [
		"zirkon",
		"presskeramik",
		"lithiumdisilikat"
	]
};
/** Einheiten mit Kronenmaterial je Zahn aus den Laborpositionen (erste festlegende Position je Zahn) */
function kronenEinheiten$1(positionen) {
	const out = /* @__PURE__ */ new Map();
	for (const p of positionen) {
		const nr = p.nr.replace(/\s/g, "");
		const e = EINHEITEN$1[`${p.ebene} ${nr}`];
		const zahn = p.zahn.trim();
		if (!e || !/^\d\d$/.test(zahn) || out.has(zahn)) continue;
		out.set(zahn, {
			zahn,
			...e,
			ebene: p.ebene,
			nr,
			labor: p.labor
		});
	}
	return [...out.values()].sort((a, b) => a.zahn.localeCompare(b.zahn));
}
//#endregion
//#region ../HKP/src/engine/abformung.ts
/** Abformart für die Implantatkronen aus der Planwahl (ältere Pläne: Angabe aus den Implantatfeldern) */
function implantatAbformung(plan) {
	if (plan.abformung === "scan") return "scan";
	if (plan.abformung === "abdruck") return plan.implantat.abformung === "offen" ? "offen" : "geschlossen";
	return plan.implantat.abformung;
}
var zaehler$2 = 0;
var pos$2 = (ebene, nr, zahn, extra = {}) => ({
	id: `abf-${Date.now().toString(36)}-${(zaehler$2++).toString(36)}`,
	ebene,
	nr,
	zahn,
	anzahl: 1,
	auto: true,
	...extra
});
/** Präparierter Zahn (Krone, Teilkrone, Teleskop) */
var KRONE = (p) => /^\d\d$/.test(p.zahn) && (p.ebene === "BEMA" && /^(20[abc]|91[abcd])$/.test(p.nr) || p.ebene === "GOZ" && /^(22[012]0|50[0-4]0)$/.test(p.nr));
/** Gips-Arbeitsmodell (Sägemodell) und Gegenkiefermodell des festsitzenden Zahnersatzes */
var GIPSMODELL = (p) => p.ebene === "BEL" && p.nr === "0051" || p.ebene === "BEB" && p.nr === "0021" || p.zahn === "" && (p.ebene === "BEL" && p.nr === "0010" || p.ebene === "BEB" && p.nr === "0002");
/** Herausnehmbarer Zahnersatz je Kiefer (Prothese, Kombinationsversorgung) */
var PROTHESE$1 = (p) => (p.zahn === "OK" || p.zahn === "UK") && (p.ebene === "BEMA" && /^(9[67][abcd]|98[b-h])$/.test(p.nr) || p.ebene === "GOZ" && /^(5180|5190|52[0-3]0)$/.test(p.nr));
/** Funktionsabformung mit individuellem Löffel ist schon enthalten (zahnloser Kiefer) */
var FUNKTIONSABFORMUNG = (p) => p.ebene === "BEMA" && /^98[bc]$/.test(p.nr) || p.ebene === "GOZ" && /^(5180|5190)$/.test(p.nr);
var KIEFER_BEREICHE = {
	OK: [
		"OK rechts",
		"OK-Front",
		"OK links"
	],
	UK: [
		"UK rechts",
		"UK-Front",
		"UK links"
	]
};
/**
* Zweite Abformung für den herausnehmbaren Teil (z. B. über die eingesetzten Primärkronen):
* Scan → GOZ 0065 für die drei Bereiche des Kiefers und gedrucktes Modell;
* Abdruck → individueller Löffel (BEMA 98a/BEL 0211 bei Kassenprothese, sonst GOZ 5170/BEB 1006).
* Kiefer mit Funktionsabformung (zahnlos, BEMA 98b/c bzw. GOZ 5180/5190) bekommen keine zweite Abformung (Scan dort: zahnlosScannen).
*/
function protheseAbformen(positionen, art, erste) {
	const kiefer = ["OK", "UK"].filter((k) => positionen.some((p) => p.zahn === k && PROTHESE$1(p)));
	if (!kiefer.length) return {
		positionen,
		hinweise: []
	};
	if (!art) {
		const offen = kiefer.filter((k) => !positionen.some((p) => p.zahn === k && FUNKTIONSABFORMUNG(p)));
		return {
			positionen,
			hinweise: erste === "scan" && offen.length ? [`Herausnehmbarer Teil ${offen.join(", ")}: zweite Abformung (Scan oder Überabdruck) noch offen.`] : []
		};
	}
	const neu = [];
	const funktion = [];
	const bearbeitet = [];
	for (const k of kiefer) {
		const imKiefer = positionen.filter((p) => p.zahn === k);
		if (imKiefer.some(FUNKTIONSABFORMUNG)) {
			funktion.push(k);
			continue;
		}
		bearbeitet.push(k);
		if (art === "scan") {
			neu.push(...KIEFER_BEREICHE[k].map((b) => pos$2("GOZ", "0065", b, { text: `Optisch-elektronische Abformung ${k} für den herausnehmbaren Teil` })));
			neu.push(pos$2("BEB", "0009", k, { text: `Modell aus Kunststoff ${k} (herausnehmbarer Teil)` }));
			continue;
		}
		const [honorar, labor] = imKiefer.some((p) => p.ebene === "BEMA" && PROTHESE$1(p)) ? [pos$2("BEMA", "98a", k), pos$2("BEL", "0211", k)] : [pos$2("GOZ", "5170", k), pos$2("BEB", "1006", k)];
		const laborVon = imKiefer.find((p) => p.ebene === labor.ebene && p.labor)?.labor;
		if (!imKiefer.some((p) => p.ebene === honorar.ebene && p.nr === honorar.nr)) neu.push(honorar);
		if (!imKiefer.some((p) => p.ebene === labor.ebene && p.nr === labor.nr)) neu.push(laborVon ? {
			...labor,
			labor: laborVon
		} : labor);
	}
	const hinweise = [];
	if (bearbeitet.length) hinweise.push(art === "scan" ? `Herausnehmbarer Teil ${bearbeitet.join(", ")}: zweiter Intraoralscan – GOZ 0065 je Bereich des Kiefers und gedrucktes Modell (BEB 0009); Gipsmodelle der Prothese ggf. streichen.` : `Herausnehmbarer Teil ${bearbeitet.join(", ")}: Überabdruck mit individuellem Löffel${neu.length ? ` (${neu.map((p) => `${p.ebene} ${p.nr}`).join(", ")})` : ""}, Meistermodell aus Gips.`);
	if (funktion.length && art !== "scan") hinweise.push(`${funktion.join(", ")}: Funktionsabformung mit individuellem Löffel ist schon enthalten – bleibt konventionell.`);
	return {
		positionen: [...positionen, ...neu],
		hinweise
	};
}
/** Situationsmodell eines Prothesenkiefers: BEL 0010 bzw. BEB 0002 mit Kieferangabe */
var SITUATIONSMODELL = (k) => (p) => p.zahn === k && (p.ebene === "BEL" && p.nr === "0010" || p.ebene === "BEB" && p.nr === "0002");
/** Schritte der analogen Totalprothese, die der digitale Ablauf ersetzt: Gipsmodelle, Mittelwertartikulator, Wachsaufstellung, Fertigstellung */
var ANALOG_PROTHESE = {
	BEL: /* @__PURE__ */ new Set([
		"0010",
		"0120",
		"3010",
		"3020",
		"3610",
		"3620"
	]),
	BEB: /* @__PURE__ */ new Set([
		"0002",
		"0402",
		"6001",
		"6002",
		"6301",
		"6302"
	])
};
/**
* Zahnloser Kiefer (Funktionsabformung, BEMA 98b/c bzw. GOZ 5180/5190) mit Intraoralscan (Chef 09.10.2026):
* der Scan ersetzt die anatomische Erstabformung – GOZ 0065 für die drei Bereiche des Kiefers und ein
* gedrucktes Modell (BEB 0009) statt des Situationsmodells. Individueller Löffel und Funktionsabformung bleiben.
* Voll digital (Chef 15.10.2026, reine Totalprothese ohne Anker im Kiefer): statt Meistermodell,
* Mittelwertartikulator, Wachsaufstellung und Fertigstellung je Auftrag Oralscan aufbereiten, CAD-Auftragsdaten und
* digitale Registrierung, je Kiefer CAD-Aufstellung, gedruckte Anprobe, gefräste Basis (BEB 0037) und Einsetzen der Zähne.
*/
function zahnlosScannen(positionen, digital) {
	const kiefer = ["OK", "UK"].filter((k) => positionen.some((p) => p.zahn === k && PROTHESE$1(p) && FUNKTIONSABFORMUNG(p)));
	if (!kiefer.length) return {
		positionen,
		hinweise: []
	};
	let out = positionen;
	const neu = [];
	for (const k of kiefer) {
		const gescannt = new Set(out.filter((p) => p.ebene === "GOZ" && p.nr === "0065").map((p) => p.zahn));
		neu.push(...KIEFER_BEREICHE[k].filter((b) => !gescannt.has(b)).map((b) => pos$2("GOZ", "0065", b, { text: `Optisch-elektronische Abformung ${k} (zahnloser Kiefer)` })));
		if (out.some((p) => p.ebene === "BEB" && p.nr === "0009" && p.zahn === k)) continue;
		const modell = out.find(SITUATIONSMODELL(k));
		if (modell) out = out.flatMap((p) => p !== modell ? [p] : (p.anzahl ?? 1) > 1 ? [{
			...p,
			anzahl: (p.anzahl ?? 1) - 1
		}] : []);
		neu.push(pos$2("BEB", "0009", k, {
			text: `Modell aus Kunststoff ${k} (gedruckt)`,
			...modell?.labor ? { labor: modell.labor } : {}
		}));
	}
	const hinweise = [`${kiefer.join(", ")} zahnlos: Intraoralscan statt anatomischer Erstabformung – GOZ 0065 je Bereich des Kiefers, gedrucktes Modell (BEB 0009) statt Situationsmodell; individueller Löffel und Funktionsabformung bleiben.`];
	const alle = [...out, ...neu];
	if (digital !== "voll") return {
		positionen: alle,
		hinweise
	};
	const ohneAnker = kiefer.filter((k) => !alle.some((p) => /^\d\d$/.test(p.zahn) && kieferVon$1(p.zahn) === k));
	if (!ohneAnker.length) return {
		positionen: alle,
		hinweise
	};
	const analog = (k) => (p) => p.zahn === k && (p.ebene === "BEL" || p.ebene === "BEB") && ANALOG_PROTHESE[p.ebene].has(p.nr);
	const laborVon = (k) => alle.find((p) => p.zahn === k && (p.ebene === "BEL" || p.ebene === "BEB") && p.labor)?.labor;
	const auftragLabor = laborVon(ohneAnker[0]);
	const digitalNeu = [];
	const beb = (nr, zahn, text, l = auftragLabor) => alle.some((p) => p.ebene === "BEB" && p.nr === nr && p.zahn === zahn) ? [] : [pos$2("BEB", nr, zahn, {
		text,
		...l ? { labor: l } : {}
	})];
	digitalNeu.push(...beb(DIGITAL_BEB$1.oralscan, "", "Oralscan aufbereiten"), ...beb(DIGITAL_BEB$1.auftragsdaten, "", "CAD: Anlage Auftragsdaten"), ...beb(DIGITAL_BEB$1.registrierung, "", "CAD: optisch digitale Registrierung (Kieferrelation)"));
	for (const k of ohneAnker) {
		const l = laborVon(k);
		digitalNeu.push(...beb(DIGITAL$1.aufstellung, k, `CAD: Prothesenzähne virtuell aufstellen ${k}`, l), ...beb(DIGITAL$1.anprobeProthese, k, `Anprobeprothese gedruckt ${k} (Try-in der CAD-Aufstellung)`, l), ...beb(PROTHESE_BASIS_GEFRAEST, k, `Konstruieren und Fräsen einer Basis aus Kunststoff ${k}`, l), ...beb(DIGITAL$1.einsetzen, k, `Zähne in die gefräste Basis ${k} einsetzen, ausarbeiten und polieren`, l));
	}
	const raus = (p) => ohneAnker.some((k) => analog(k)(p));
	return {
		positionen: [...alle.filter((p) => !raus(p)), ...digitalNeu],
		hinweise: [...hinweise, `Totalprothese ${ohneAnker.join(", ")} voll digital: Oralscan aufbereiten, CAD-Auftragsdaten und digitale Kieferrelation; je Kiefer CAD-Aufstellung, gedruckte Anprobe, gefräste Basis (BEB 0037) und Einsetzen der Zähne statt Meistermodell, Mittelwertartikulator, Wachsaufstellung und Fertigstellung. Löffel, Bissschablone und Funktionsabformung bleiben (Einstellung „Totalprothese nach Scan“).`]
	};
}
/** BEB-ITZ 0037: Konstruieren und Fräsen einer Basis aus Kunststoff */
var PROTHESE_BASIS_GEFRAEST = "0037";
/**
* Erste Abformung (präparierte Zähne): Scan → GOZ 0065 je Bereich (mit Gegenkiefer) und gedruckte Modelle
* statt Gipsmodellen (auch bei reinen Implantatkronen: nie Gips- und gedrucktes Modell zugleich); der Abdruck
* ändert nichts. Implantatspezifische Leistungen regelt implantatPositionen.
* Danach die zweite Abformung für den herausnehmbaren Teil.
*/
function abformungAnwenden(positionen, zaehne, abformung, prothese = "", eigenlabor = false, protheseDigital = "voll") {
	const erste = abformung === "scan" ? scanAnwenden(positionen, zaehne) : {
		positionen,
		hinweise: []
	};
	const digital = abformung === "scan" ? digitalerWorkflow(erste.positionen, zaehne, eigenlabor) : {
		positionen: erste.positionen,
		hinweise: []
	};
	const zweite = protheseAbformen(digital.positionen, prothese, abformung);
	const zahnlos = abformung === "scan" || prothese === "scan" ? zahnlosScannen(zweite.positionen, protheseDigital) : {
		positionen: zweite.positionen,
		hinweise: []
	};
	return {
		positionen: zahnlos.positionen,
		hinweise: [
			...erste.hinweise,
			...digital.hinweise,
			...zweite.hinweise,
			...zahnlos.hinweise
		]
	};
}
var istImplantat$1 = (zaehne, z) => /^S/i.test((zaehne[z]?.TP.trim() || zaehne[z]?.R || "").toUpperCase());
/** Mittelwertartikulator des festsitzenden Zahnersatzes (BEL 0120 bzw. BEB 0402 ohne Kieferangabe) */
var ARTIKULATOR = (p) => p.zahn === "" && (p.ebene === "BEL" && p.nr === "0120" || p.ebene === "BEB" && p.nr === "0402");
var VERBLENDUNG = (p) => p.ebene === "BEL" && /^16\d\d$/.test(p.nr) || p.ebene === "BEB" && /^26[0-9]{2}$/.test(p.nr);
var INLAY = (p) => p.ebene === "BEB" && /^(230[1-4]|255[1-9]|2560)$/.test(p.nr) && /^\d\d$/.test(p.zahn);
var KERAMIK_INLAY$1 = /^(255[1-9]|2560)$/;
/** Verbinder je Brücke: zwischen den Gliedern und zu jedem Anker daneben */
function verbinder$1(glieder, anker) {
	const out = [];
	for (const reihe of [OBERKIEFER$1, UNTERKIEFER$1]) {
		let lauf = [];
		const ende = () => {
			if (!lauf.length) return;
			const a = lauf[0];
			const b = lauf[lauf.length - 1];
			const links = anker.has(reihe[a - 1] ?? "");
			const rechts = anker.has(reihe[b + 1] ?? "");
			const n = lauf.length - 1 + Number(links) + Number(rechts);
			if (n > 0) out.push({
				zahn: `${reihe[links ? a - 1 : a]}-${reihe[rechts ? b + 1 : b]}`,
				anzahl: n
			});
			lauf = [];
		};
		reihe.forEach((z, i) => glieder.includes(z) ? lauf.push(i) : ende());
		ende();
	}
	return out;
}
/**
* Digitaler Ablauf im Labor nach Intraoralscan (Eigen- und Fremdlabor, BEB): je Auftrag Oralscan aufbereiten,
* CAD-Auftragsdaten und optisch digitale Registrierung statt Mittelwertartikulator; je Arbeitskiefer
* Modellsegmentierung; je präpariertem Zahn Präp freilegen, Druckstumpf, Segment und Präpgrenze; CAD-Konstruktion
* je Krone, Kaufläche (Teilkrone/Inlay) bzw. Brückenglied mit Verbindern und CAM-Nacharbeit je Element;
* je Keramikeinheit Sintern (nur Zirkon, siehe kronenmaterial) und Glanz-/Kristallisationsbrand.
* Steckartikulator (BEB 0401) nur, wenn von Hand verblendet wird; Scanbody-Matching nur im Eigenlabor.
*/
function digitalerWorkflow(positionen, zaehne, eigenlabor) {
	const zahnLabor = positionen.filter((p) => (p.ebene === "BEL" || p.ebene === "BEB") && /^\d\d$/.test(p.zahn));
	const einheiten = kronenEinheiten$1(zahnLabor).filter((e) => e.einheit !== "sekundaerteleskop" && e.einheit !== "veneer");
	const einheit = new Map(einheiten.map((e) => [e.zahn, e]));
	const stuempfe = [...new Set(positionen.filter(KRONE).map((p) => p.zahn))].filter((z) => !istImplantat$1(zaehne, z)).sort();
	const inlays = [...new Set(positionen.filter(INLAY).map((p) => p.zahn))].filter((z) => !einheit.has(z)).sort();
	const implantate = [...new Set(positionen.filter((p) => p.ebene === "BEB" && p.nr === "0224").map((p) => p.zahn))];
	const kronen = [.../* @__PURE__ */ new Set([...einheiten.filter((e) => e.einheit !== "glied" && e.einheit !== "teilkrone").map((e) => e.zahn), ...stuempfe.filter((z) => !einheit.has(z) && !inlays.includes(z))])];
	const kauflaechen = [...einheiten.filter((e) => e.einheit === "teilkrone").map((e) => e.zahn), ...inlays];
	const glieder = einheiten.filter((e) => e.einheit === "glied").map((e) => e.zahn);
	const keramik = [...einheiten.filter((e) => e.art === "keramik").map((e) => e.zahn), ...inlays.filter((z) => positionen.some((p) => INLAY(p) && p.zahn === z && KERAMIK_INLAY$1.test(p.nr)))].sort();
	const elemente = [
		...kronen,
		...kauflaechen,
		...glieder
	];
	if (!elemente.length && !implantate.length) return {
		positionen,
		hinweise: []
	};
	const labor = (zahn) => eigenlabor ? "eigen" : zahnLabor.find((p) => p.zahn === zahn && p.labor)?.labor;
	const auftragLabor = eigenlabor ? "eigen" : zahnLabor.find((p) => p.labor)?.labor;
	const vorhanden = (nr, zahn) => positionen.some((p) => p.ebene === "BEB" && p.nr === nr && p.zahn === zahn);
	const beb = (nr, zahn, l = /^\d\d$/.test(zahn) ? labor(zahn) : auftragLabor, anzahl = 1) => vorhanden(nr, zahn) ? [] : [pos$2("BEB", nr, zahn, {
		anzahl,
		...l ? { labor: l } : {}
	})];
	const je = (zaehne, ...nrs) => zaehne.flatMap((z) => nrs.flatMap((nr) => beb(nr, z)));
	const D = DIGITAL_BEB$1;
	const arbeitsKiefer = [...new Set([...elemente, ...implantate].map(kieferVon$1))];
	const bruecken = verbinder$1(glieder, /* @__PURE__ */ new Set([...kronen, ...kauflaechen]));
	const verblendet = positionen.some((p) => VERBLENDUNG(p) && /^\d\d$/.test(p.zahn) && (elemente.includes(p.zahn) || implantate.includes(p.zahn)));
	const neu = [
		...beb(D.oralscan, ""),
		...beb(D.auftragsdaten, ""),
		...beb(D.registrierung, ""),
		...arbeitsKiefer.flatMap((k) => beb(D.segmentierung, k)),
		...je(stuempfe, D.praepFreilegen, D.druckstumpf, D.segment, D.praepgrenze),
		...je(kronen, D.krone),
		...je(kauflaechen, D.kauflaeche),
		...je(glieder, D.glied),
		...bruecken.flatMap((b) => beb(D.verbinder, b.zahn, labor(b.zahn.split("-")[0]), b.anzahl)),
		...je(elemente, D.nacharbeiten),
		...je(keramik, D.sintern, D.glanzbrand),
		...eigenlabor ? implantate.flatMap((z) => beb(DIGITAL$1.scanbody, z)) : [],
		...verblendet ? beb("0401", "") : []
	];
	const teile = [
		"Oralscan aufbereiten, CAD-Auftragsdaten und digitale Registrierung statt Mittelwertartikulator",
		stuempfe.length && `Präp freilegen, Druckstumpf, Segment und Präpgrenze je Stumpf (${stuempfe.join(", ")})`,
		`CAD-Konstruktion ${[
			kronen.length && `${kronen.length} Krone${kronen.length > 1 ? "n" : ""}`,
			kauflaechen.length && `${kauflaechen.length} Kaufläche${kauflaechen.length > 1 ? "n" : ""}`,
			glieder.length && `${glieder.length} Brückenglied${glieder.length > 1 ? "er" : ""}`
		].filter(Boolean).join(", ") || "Implantatversorgung"} mit CAM-Nacharbeit`,
		bruecken.length && `Verbinder ${bruecken.map((b) => b.zahn).join(", ")}`,
		keramik.length && `Sintern (Zirkon) und Glanz-/Kristallisationsbrand ${keramik.join(", ")}`,
		eigenlabor && implantate.length && `Scanbody-Matching ${implantate.join(", ")}`,
		verblendet && "Steckartikulator für die Verblendung"
	].filter(Boolean);
	return {
		positionen: [...positionen.filter((p) => !ARTIKULATOR(p)), ...neu],
		hinweise: [`Digitaler Ablauf nach Intraoralscan (${eigenlabor ? "Eigenlabor" : "Labor"}): ${teile.join("; ")}.`]
	};
}
function scanAnwenden(positionen, zaehne) {
	const implantat = (z) => /^S/i.test((zaehne[z]?.TP.trim() || zaehne[z]?.R || "").toUpperCase());
	const praepariert = [...new Set(positionen.filter(KRONE).map((p) => p.zahn))].filter((z) => !implantat(z));
	const implantatKronen = [...new Set(positionen.filter((p) => /^\d\d$/.test(p.zahn) && implantat(p.zahn)).map((p) => p.zahn))];
	const hinweise = [];
	if (!praepariert.length && !implantatKronen.length) return {
		positionen,
		hinweise
	};
	const bereiche = [...new Set([...praepariert, ...implantatKronen].map(bereich$2))];
	const gescannt = new Set(positionen.filter((p) => p.ebene === "GOZ" && p.nr === "0065").map((p) => p.zahn));
	const regionen = [.../* @__PURE__ */ new Set([...bereiche, ...bereiche.map((b) => GEGENUEBER[b])])].filter((r) => !gescannt.has(r));
	const labor = positionen.find(GIPSMODELL)?.labor;
	const gedruckt = new Set(positionen.filter((p) => p.ebene === "BEB" && p.nr === "0009").map((p) => p.zahn));
	const kiefer = ["OK", "UK"].filter((k) => !gedruckt.has(k));
	const neu = [...regionen.map((r) => pos$2("GOZ", "0065", r)), ...kiefer.map((k) => pos$2("BEB", "0009", k, labor ? { labor } : {}))];
	const arbeitsKiefer = [...new Set([...praepariert, ...implantatKronen].map(kieferVon$1))];
	hinweise.push(`Intraoralscan (${regionen.length ? regionen.join(", ") : "bereits erfasst"}): GOZ 0065 statt konventioneller Abformung, gedruckte Modelle ${arbeitsKiefer.join("/")} mit Gegenkiefer (BEB 0009) statt Gips-/Sägemodell.`);
	return {
		positionen: [...positionen.filter((p) => !GIPSMODELL(p)), ...neu],
		hinweise
	};
}
//#endregion
//#region ../HKP/src/engine/therapie.ts
/**
* Zuordnung Therapiekürzel (Zeile TP) zu GOZ- und BEB-Leistungen für gleich-/andersartige Versorgung.
* `gozAnker` gilt, wenn der Zahn Brücken- oder Prothesenanker ist.
*/
var TP_ZUORDNUNG = {
	K: {
		goz: "2210",
		gozAnker: "5010",
		beb: ["2101"]
	},
	KV: {
		goz: "2210",
		gozAnker: "5010",
		beb: ["2121", "2611"]
	},
	KM: {
		goz: "2210",
		gozAnker: "5010",
		beb: ["2281", "2612"]
	},
	KH: {
		goz: "2210",
		gozAnker: "5010",
		beb: ["2101"]
	},
	KVH: {
		goz: "2210",
		gozAnker: "5010",
		beb: ["2121", "2611"]
	},
	KMH: {
		goz: "2210",
		gozAnker: "5010",
		beb: ["2281", "2612"]
	},
	PK: {
		goz: "2220",
		beb: ["2104"]
	},
	PKV: {
		goz: "2220",
		beb: ["2126", "2611"]
	},
	PKM: {
		goz: "2220",
		beb: ["2534"]
	},
	VE: {
		goz: "2220",
		beb: [
			"0833",
			"2653",
			"2951"
		]
	},
	ZA: {
		goz: "2210",
		gozAnker: "5010",
		beb: ["2251"]
	},
	ZAB: {
		goz: "",
		beb: ["2351"]
	},
	I1: {
		goz: "2150",
		beb: ["2301"]
	},
	I2: {
		goz: "2160",
		beb: ["2302"]
	},
	I3: {
		goz: "2170",
		beb: ["2303"]
	},
	I4: {
		goz: "2170",
		beb: ["2304"]
	},
	C1: {
		goz: "2150",
		beb: ["2551"]
	},
	C2: {
		goz: "2160",
		beb: ["2552"]
	},
	C3: {
		goz: "2170",
		beb: ["2553"]
	},
	C4: {
		goz: "2170",
		beb: ["2554"]
	},
	ON: {
		goz: "2170",
		beb: ["2304"]
	},
	ONK: {
		goz: "2170",
		beb: ["2554"]
	},
	T: {
		goz: "5040",
		beb: ["3001"]
	},
	TZ: {
		goz: "5040",
		beb: ["3001", "6905"]
	},
	TZV: {
		goz: "5040",
		beb: [
			"3001",
			"6905",
			"2602"
		]
	},
	TV: {
		goz: "5040",
		beb: ["3001", "2611"]
	},
	TM: {
		goz: "5040",
		beb: ["3001", "2602"]
	},
	KO: {
		goz: "2210",
		gozAnker: "5010",
		beb: ["2101", "3023"]
	},
	KVO: {
		goz: "2210",
		gozAnker: "5010",
		beb: [
			"2121",
			"2611",
			"3023"
		]
	},
	KMO: {
		goz: "2210",
		gozAnker: "5010",
		beb: [
			"2281",
			"2612",
			"3023"
		]
	},
	T2: {
		goz: "5100",
		beb: ["3001"]
	},
	T2V: {
		goz: "5100",
		beb: ["3001", "2611"]
	},
	T2M: {
		goz: "5100",
		beb: ["3001", "2602"]
	},
	ZAS: {
		goz: "2200",
		gozAnker: "5000",
		beb: ["2251"]
	},
	SK: {
		goz: "2200",
		gozAnker: "5000",
		beb: ["2101"]
	},
	SKV: {
		goz: "2200",
		gozAnker: "5000",
		beb: ["2121", "2611"]
	},
	SKM: {
		goz: "2200",
		gozAnker: "5000",
		beb: ["2281", "2612"]
	},
	SKO: {
		goz: "2200",
		gozAnker: "5000",
		beb: ["2101", "3023"]
	},
	SKVO: {
		goz: "2200",
		gozAnker: "5000",
		beb: [
			"2121",
			"2611",
			"3023"
		]
	},
	SKMO: {
		goz: "2200",
		gozAnker: "5000",
		beb: [
			"2281",
			"2612",
			"3023"
		]
	},
	STZ: {
		goz: "5040",
		beb: ["3001", "6905"]
	},
	STZV: {
		goz: "5040",
		beb: [
			"3001",
			"6905",
			"2602"
		]
	},
	ST: {
		goz: "5040",
		beb: ["3001"]
	},
	STV: {
		goz: "5040",
		beb: ["3001", "2611"]
	},
	STM: {
		goz: "5040",
		beb: ["3001", "2602"]
	},
	A: {
		goz: "",
		beb: ["2155"]
	},
	ABV: {
		goz: "",
		beb: ["2362", "2611"]
	},
	ABM: {
		goz: "",
		beb: ["2351", "2612"]
	},
	B: {
		goz: "",
		beb: ["2362"]
	},
	BV: {
		goz: "",
		beb: ["2362", "2611"]
	},
	BM: {
		goz: "",
		beb: ["2351", "2612"]
	},
	SB: {
		goz: "",
		beb: ["2362"]
	},
	SBV: {
		goz: "",
		beb: ["2362", "2611"]
	},
	SBM: {
		goz: "",
		beb: ["2351", "2612"]
	}
};
/** Brückenglied, auch implantatgetragen oder adhäsiv */
var GLIED$2 = /^(S?B|AB)[VM]?$|^ZAB$/;
/** ersetzter Zahn einer Prothese, auch über einem Steg oder auf einem Implantat-Verbindungselement */
var PROTHESENZAHN$1 = /^(S?EO?|SO)$/;
/** ersetzter Zahn über einem Steg */
var STEGZAHN$1 = /^S?EO$/;
/** Krone mit Geschiebe */
var GESCHIEBE$1 = /^S?K[VM]?O$/;
/** Pfeiler mit Krone, Teilkrone oder Teleskop (natürlich oder implantatgetragen) */
var PFEILERKRONE$1 = /^(S?K|PK|ZA$|ZAS$|S?T)/;
var IMPLANTAT_PROTHESE$1 = /^(SE|SEO|SO|ST[VM]?|STZ|STZV)$/;
/** Kürzel, die eine Prothese im Kiefer voraussetzen (ersetzte Zähne, Teleskope, Geschiebe, Halteelemente) */
var PROTHESEN_TP = /^(S?EO?|SO|S?T|S?K[VM]?O|K[VM]?H|H)$/;
var ZAHN_BEMA = /^(20[abc]|91[abd]|90)$/;
var ZAHN_BEL = /^(1013|1021|1022|1024|1026|1100|1200|1201|1343|1620)$/;
var PROTHESE_BEMA = /^(96[abc]|97[ab]|98[abceg]|98h\/[12])$/;
var PROTHESE_BEL = /* @__PURE__ */ new Set([
	"0010",
	"0021",
	"0211",
	"0213",
	"0220",
	"0120",
	"2010",
	"3010",
	"3020",
	"3030",
	"3610",
	"3620"
]);
var EINHEIT_BEL = /* @__PURE__ */ new Set([
	"1021",
	"1022",
	"1024",
	"1100"
]);
var ZAHNARBEIT_BEL = /^(1013|1021|1022|1024|1026|1100|1200|1201)$/;
var zaehler$1 = 0;
function pos$1(ebene, nr, zahn, anzahl = 1) {
	return {
		id: `auto-tp-${Date.now().toString(36)}-${(zaehler$1++).toString(36)}`,
		ebene,
		nr,
		zahn,
		anzahl,
		auto: true
	};
}
var befundKuerzel = (z) => befundOhneStrich(z?.B ?? "");
var zahnListe$1 = (zahn) => zahn.split(/[,\s]+/).filter(Boolean);
var spanne$1 = (zaehne) => zaehne.length === 1 ? zaehne[0] : `${zaehne[0]}-${zaehne[zaehne.length - 1]}`;
/** Vollanatomische Seitenzahnkrone 2251, Front 2252; Brückenglied 2351 bzw. 2352 */
function bebFuer$1(k, b, z) {
	if (!istFrontzahn$1(z)) return b;
	if ((k === "ZA" || k === "ZAS") && b === "2251") return "2252";
	if (k === "ZAB" && b === "2351") return "2352";
	return b;
}
/** Versorgungsform eines Kürzels für die Abgrenzung gleich-/andersartig */
function kuerzelArt(k) {
	k = k.trim().toUpperCase();
	if (!k) return "";
	if (k === "ZAS" || k.startsWith("S")) return "implantat";
	if (/^(E|EO|H)$/.test(k)) return "prothese";
	if (/^(T|R)/.test(k) || GESCHIEBE$1.test(k)) return "kombi";
	if (/^(B|A)/.test(k) || k === "ZAB") return "bruecke";
	return "krone";
}
/**
* Macht die Therapieplanung (TP) an einem Zahn die Versorgung andersartig? Nach Anlage 2 BMV-Z bleiben
* Geschiebe/Stege anstelle von Teleskopen und Geschiebe an überkronungsbedürftigen Zähnen gleichartig;
* Implantate (Erstversorgung), Brücken statt Prothese und Prothese statt Brücke sind andersartig.
*/
function andersartig(r, tp, prothesenKiefer) {
	const a = kuerzelArt(r);
	const b = kuerzelArt(tp);
	if (!b || r.trim().toUpperCase() === tp.trim().toUpperCase()) return false;
	if (b === "implantat") return a !== "implantat";
	if (!a) return b === "prothese" ? !prothesenKiefer : b !== "krone";
	if (a === "krone") return b !== "krone" && !GESCHIEBE$1.test(tp.trim().toUpperCase());
	if (a === "kombi") return b !== "kombi" && b !== "krone";
	if (r.trim().toUpperCase() === "H" && b === "krone") return !/H$/.test(tp.trim().toUpperCase());
	return a !== b;
}
/**
* Wendet die Therapieplanung (Zeile TP) auf die Regelversorgung an – nach den Berechnungsbeispielen
* des KZBV-Kompendiums: Zähne mit abweichender Planung werden nach GOZ/BEB berechnet, gleichartige
* Bestandteile behalten Provisorien und Prothesenleistungen nach BEMA, andersartige Bestandteile
* (Implantate, Brücke statt Prothese, Prothese statt Brücke, implantatgetragene Prothese) werden
* vollständig nach GOZ/BEB berechnet (Mischfall: Regelbestandteile bleiben BEMA/BEL).
* Leeres TP bedeutet Regelversorgung – außer bei Brücken, deren Glieder durch Implantate oder eine
* Prothese ersetzt werden, und bei Prothesen, deren ersetzte Zähne festsitzend versorgt werden.
*/
function therapieplanAnwenden(regel, zaehne) {
	const R = regel.R;
	const tp = {};
	for (const [z, v] of Object.entries(zaehne)) {
		const t = v.TP.trim().toUpperCase();
		if (t && t !== (R[z] ?? "")) tp[z] = t;
	}
	if (!Object.keys(tp).length) return regel;
	const B = (z) => befundKuerzel(zaehne[z]);
	const hinweise = [...regel.hinweise];
	const hinweis = (h) => {
		if (!hinweise.includes(h)) hinweise.push(h);
	};
	let positionen = [...regel.positionen];
	const neu = [];
	const entfernen = (f) => {
		positionen = positionen.filter((p) => !f(p));
	};
	for (const [kiefer, reihe] of [["OK", OBERKIEFER$1], ["UK", UNTERKIEFER$1]]) {
		if (!reihe.some((z) => tp[z])) continue;
		const kieferName = kiefer === "OK" ? "Oberkiefer" : "Unterkiefer";
		const sitz = reihe.filter((z) => B(z) !== ")(");
		const zahnlos = sitz.filter((z) => !istWeisheitszahn$1(z)).every((z) => FEHLEND.has(B(z)));
		const roh = (z) => tp[z] ?? R[z] ?? "";
		const ueber = {};
		const wegfall = /* @__PURE__ */ new Set();
		const prothesenSpannen = /* @__PURE__ */ new Set();
		const spannen = positionen.filter((p) => p.ebene === "BEMA" && p.nr === "92" && kieferVon$1(p.zahn.split("-")[0]) === kiefer);
		const glieder = (p) => {
			const [von, bis] = p.zahn.split("-");
			const a = sitz.indexOf(von);
			const b = sitz.indexOf(bis);
			return sitz.slice(Math.min(a, b) + 1, Math.max(a, b));
		};
		const bleibendeSpannen = spannen.filter((p) => glieder(p).every((z) => GLIED$2.test(roh(z))));
		const bleibend = new Set(bleibendeSpannen.flatMap((p) => p.zahn.split("-")));
		const aufgeloest = spannen.filter((p) => glieder(p).every((z) => !GLIED$2.test(roh(z))));
		for (const p of spannen) if (!bleibendeSpannen.includes(p) && !aufgeloest.includes(p)) hinweis(`Brücke ${p.zahn}: nur teilweise ersetzt – Leistungen bitte prüfen.`);
		for (const p of aufgeloest) {
			for (const x of p.zahn.split("-")) {
				if (tp[x] || bleibend.has(x)) continue;
				if (KRONE_NOETIG.has(B(x))) positionen = positionen.map((q) => q.zahn === x && q.ebene === "BEMA" && /^91[ab]$/.test(q.nr) ? {
					...q,
					nr: imVerblendbereich(x) ? "20b" : "20a"
				} : q);
				else {
					wegfall.add(x);
					entfernen((q) => q.zahn === x && (q.ebene === "BEMA" && /^(91[ab]|19)$/.test(q.nr) || q.ebene === "BEL" && ZAHN_BEL.test(q.nr)));
				}
			}
			hinweis(`Brücke ${p.zahn} entfällt (Glieder durch ${glieder(p).some((z) => roh(z).startsWith("S")) ? "Implantate" : "Prothese"} ersetzt); Anker ohne eigenen Kronenbefund werden nicht versorgt, der Festzuschuss bleibt.`);
			if (glieder(p).every((z) => PROTHESENZAHN$1.test(roh(z)))) {
				prothesenSpannen.add(spanne$1(glieder(p)));
				neu.push(pos$1("GOZ", "5070", spanne$1(glieder(p))));
			}
		}
		const tpRoh = (z) => zaehne[z]?.TP.trim().toUpperCase() ?? "";
		const regelProthese = sitz.some((z) => R[z] === "E");
		const ersetzt = sitz.filter((z) => R[z] === "E" && tp[z] && !PROTHESEN_TP.test(tp[z]));
		const protheseGeplant = sitz.some((z) => PROTHESEN_TP.test(tpRoh(z)));
		const implantatProthese = sitz.some((z) => tp[z] && IMPLANTAT_PROTHESE$1.test(tp[z]) && !(R[z] ?? "").startsWith("S"));
		const entfaellt = regelProthese && ersetzt.length > 0 && !protheseGeplant;
		if (entfaellt) {
			for (const z of sitz) {
				if (tp[z]) continue;
				const r = R[z] ?? "";
				if (r === "E" || r === "H") wegfall.add(z);
				else if (/^T/.test(r)) {
					if (KRONE_NOETIG.has(B(z))) {
						ueber[z] = imVerblendbereich(z) ? "KV" : "K";
						positionen = positionen.map((q) => q.zahn !== z ? q : q.ebene === "BEMA" && q.nr === "91d" ? {
							...q,
							nr: imVerblendbereich(z) ? "20b" : "20a"
						} : q.ebene === "BEL" && q.nr === "1200" ? {
							...q,
							nr: imVerblendbereich(z) ? "1024" : "1021"
						} : q);
					} else {
						wegfall.add(z);
						entfernen((q) => q.zahn === z && (q.ebene === "BEMA" && /^(91d|19)$/.test(q.nr) || q.ebene === "BEL" && ZAHN_BEL.test(q.nr)));
					}
				}
			}
			const rest = sitz.filter((z) => R[z] === "E" && !tp[z]);
			hinweis(`${kieferName}: festsitzende Versorgung statt Prothese (andersartig) – die Prothese der Regelversorgung entfällt${rest.length ? `, ${rest.join(", ")} werden nicht ersetzt` : ""}. Für eine Prothese die zu ersetzenden Zähne in Zeile TP mit E kennzeichnen.`);
		} else if (regelProthese && ersetzt.length) {
			const ohne = sitz.filter((z) => R[z] === "E" && !tpRoh(z));
			for (const z of ohne) wegfall.add(z);
			if (ohne.length) hinweis(`${kieferName}: Prothese nur für die in Zeile TP mit E markierten Zähne – ${ohne.join(", ")} werden nicht ersetzt.`);
		}
		const plan = (z) => tp[z] ?? ueber[z] ?? (wegfall.has(z) ? "" : R[z] ?? "");
		const laeufe = (f) => {
			const out = [];
			let akt = [];
			sitz.forEach((z, i) => {
				if (f(z)) akt.push(z);
				if ((!f(z) || i === sitz.length - 1) && akt.length) {
					out.push({
						zaehne: akt,
						links: sitz[sitz.indexOf(akt[0]) - 1],
						rechts: sitz[sitz.indexOf(akt[akt.length - 1]) + 1]
					});
					akt = [];
				}
			});
			return out;
		};
		const istPfeiler = (x) => !!x && (PFEILERKRONE$1.test(plan(x)) || plan(x) === "A");
		const prothesenZaehne = sitz.filter((z) => PROTHESENZAHN$1.test(plan(z)));
		const prothese = implantatProthese || !regelProthese && prothesenZaehne.length ? "andersartig" : entfaellt ? "entfaellt" : regelProthese ? "regel" : "keine";
		const markiert = brueckenBereiche$1(reihe, plan, (z) => zaehne[z]).filter((b) => b.explizit);
		const bruecken = laeufe((z) => GLIED$2.test(plan(z))).map((l) => {
			const m = markiert.find((b) => l.zaehne.every((z) => b.zaehne.includes(z)));
			return {
				...l,
				anker: m ? pfeilerIm$1(m, plan) : [l.links, l.rechts].filter(istPfeiler)
			};
		});
		const brueckenAnker = new Set(bruecken.flatMap((b) => b.anker));
		const stege = laeufe((z) => STEGZAHN$1.test(plan(z)));
		const stegAnker = new Set(stege.flatMap((s) => [s.links, s.rechts]).filter((x) => !!x));
		const anders = new Set(sitz.filter((z) => tp[z] && andersartig(R[z] ?? "", tp[z], regelProthese)));
		if (prothese === "andersartig") for (const z of sitz) {
			const k = plan(z);
			if (PROTHESENZAHN$1.test(k) || /^S?T/.test(k) || GESCHIEBE$1.test(k) || /H$/.test(k) || stegAnker.has(z)) anders.add(z);
		}
		for (const b of bruecken) {
			const teile = [...b.zaehne, ...b.anker];
			if (teile.some((z) => anders.has(z))) for (const z of teile) anders.add(z);
		}
		positionen = positionen.flatMap((p) => {
			if (!spannen.includes(p)) return [p];
			if (aufgeloest.includes(p)) return [];
			const g = glieder(p);
			return g.some((z) => tp[z] || anders.has(z)) ? [{
				...pos$1("GOZ", "5070", spanne$1(g)),
				anzahl: p.anzahl
			}] : [p];
		});
		if (regelProthese && (prothese === "andersartig" || prothese === "entfaellt")) {
			entfernen((p) => p.zahn === kiefer && (p.ebene === "BEMA" && PROTHESE_BEMA.test(p.nr) || p.ebene === "BEL" && PROTHESE_BEL.has(p.nr)));
			entfernen((p) => p.ebene === "BEL" && p.nr === "2031" && zahnListe$1(p.zahn).some((z) => kieferVon$1(z) === kiefer));
		} else if (prothese === "regel") {
			const n = prothesenZaehne.length;
			positionen = positionen.map((p) => p.zahn !== kiefer ? p : p.ebene === "BEMA" && /^96[abc]$/.test(p.nr) ? {
				...p,
				nr: n <= 4 ? "96a" : n <= 8 ? "96b" : "96c"
			} : p.ebene === "BEL" && /^(3020|3030|3620)$/.test(p.nr) ? {
				...p,
				anzahl: n
			} : p);
			const halte = sitz.filter((z) => /H$/.test(plan(z)));
			const hatte = positionen.some((p) => p.ebene === "BEL" && p.nr === "2031" && zahnListe$1(p.zahn).some((z) => kieferVon$1(z) === kiefer));
			positionen = positionen.flatMap((p) => {
				if (p.ebene === "BEL" && p.nr === "2031" && zahnListe$1(p.zahn).some((z) => kieferVon$1(z) === kiefer)) return halte.length ? [{
					...p,
					zahn: halte.join(","),
					anzahl: halte.length
				}] : [];
				if (p.ebene === "BEMA" && /^98h/.test(p.nr) && p.zahn === kiefer) return halte.length ? [{
					...p,
					nr: halte.length >= 2 ? "98h/2" : "98h/1"
				}] : [];
				return [p];
			});
			if (halte.length && !hatte) positionen.push(pos$1("BEMA", halte.length >= 2 ? "98h/2" : "98h/1", kiefer), pos$1("BEL", "2031", halte.join(","), halte.length));
		}
		for (const z of sitz) {
			if (!tp[z] && !anders.has(z)) continue;
			const k = plan(z);
			const andersZ = anders.has(z);
			const hatte19 = positionen.some((p) => p.ebene === "BEMA" && p.nr === "19" && p.zahn === z);
			const regelGozBeb = TP_ZUORDNUNG[R[z] ?? ""];
			entfernen((p) => p.zahn === z && (p.ebene === "BEMA" && (ZAHN_BEMA.test(p.nr) || andersZ && p.nr === "19") || p.ebene === "BEL" && ZAHN_BEL.test(p.nr) || !!regelGozBeb && (p.ebene === "GOZ" && (p.nr === regelGozBeb.goz || p.nr === regelGozBeb.gozAnker) || p.ebene === "BEB" && regelGozBeb.beb.includes(p.nr))));
			if (andersZ) {
				const stifte = positionen.filter((p) => p.zahn === z && p.ebene === "BEMA" && /^18[ab]$/.test(p.nr));
				entfernen((p) => p.zahn === z && (p.ebene === "BEMA" && /^18[ab]$/.test(p.nr) || p.ebene === "BEL" && /^(1033|1050)$/.test(p.nr)));
				for (const s of stifte) {
					const n = s.nachtraeglich ? { nachtraeglich: true } : {};
					neu.push({
						...pos$1("GOZ", s.nr === "18a" ? "2195" : "2190", z),
						...n
					});
					if (s.nr === "18b") neu.push({
						...pos$1("BEB", "2001", z),
						...n
					});
				}
			}
			if (!k || PROTHESENZAHN$1.test(k) || k === "H" || k === "R" || k === ")(") continue;
			if (k === "A") hinweis("Adhäsivbrücke: GOZ 5150 (erste Spanne) bzw. 5160 (jede weitere) je Spanne ansetzen.");
			const zuo = TP_ZUORDNUNG[k];
			if (!zuo) {
				hinweis(`Für Therapiekürzel ${k} (Zahn ${z}) ist keine GOZ/BEB-Zuordnung hinterlegt – bitte manuell ergänzen.`);
				continue;
			}
			const goz = (brueckenAnker.has(z) || GESCHIEBE$1.test(k) || stegAnker.has(z)) && zuo.gozAnker ? zuo.gozAnker : zuo.goz;
			if (goz) neu.push(pos$1("GOZ", goz, z));
			for (const b of zuo.beb) neu.push(pos$1("BEB", bebFuer$1(k, b, z), z));
			if (/^(TM|STM|T2M|TZV|STZV)$/.test(k)) hinweis("Vollverblendete Teleskope: Verblendung aus Kunststoff (Komposite, BEB 2602). Keramik platzt beim Aufsetzen durch die Spannung ab.");
			if (/^VEK?$/.test(k)) neu.push(pos$1("GOZ", "2197", z));
			if (GESCHIEBE$1.test(k)) neu.push(pos$1("GOZ", "5080", z));
			if (PFEILERKRONE$1.test(k) && (andersZ || !hatte19)) neu.push(pos$1("GOZ", andersZ && brueckenAnker.has(z) ? "5120" : "2270", z));
		}
		for (const z of sitz) {
			if (tp[z] !== "R" || stegAnker.has(z)) continue;
			hinweis(`Wurzelstiftkappe ${z}: zahnärztlich GOZ 5030, zahntechnische Leistung bitte ergänzen.`);
			neu.push(pos$1("GOZ", "5030", z));
		}
		const regelSpannen = new Set(spannen.map((p) => p.zahn));
		for (const b of bruecken) {
			const ankerSpanne = `${b.links && b.anker.includes(b.links) ? b.links : b.zaehne[0]}-${b.rechts && b.anker.includes(b.rechts) ? b.rechts : b.zaehne[b.zaehne.length - 1]}`;
			const andersB = b.zaehne.some((z) => anders.has(z));
			if (!regelSpannen.has(ankerSpanne) && (b.zaehne.some((z) => tp[z]) || andersB)) neu.push(pos$1("GOZ", "5070", spanne$1(b.zaehne)));
			if (andersB) neu.push(pos$1("GOZ", "5140", spanne$1(b.zaehne)));
		}
		for (const s of stege) {
			const zahn = spanne$1(s.zaehne);
			neu.push(pos$1("GOZ", "5070", zahn), pos$1("GOZ", "5080", zahn));
			neu.push(pos$1("BEB", "3031", zahn), pos$1("BEB", "3032", zahn, s.zaehne.length), pos$1("BEB", zahnlos ? "3621" : "3623", zahn));
		}
		for (const x of stegAnker) {
			const k = plan(x);
			if (k === "SO") neu.push(pos$1("GOZ", "5030", x), pos$1("BEB", "2035", x), pos$1("BEB", "3906", x));
			else if (k === "R" || B(x) === "r" || B(x) === "rw") {
				entfernen((p) => p.zahn === x && (p.ebene === "BEMA" && p.nr === "90" || p.ebene === "BEL" && /^(1013|1343)$/.test(p.nr)));
				neu.push(pos$1("GOZ", "5030", x), pos$1("BEB", "2181", x));
			} else if (!PFEILERKRONE$1.test(k)) hinweis(`Steg: Zahn ${x} ist kein Steganker (Krone, Wurzelkappe oder Implantat mit SO) – Planung bitte prüfen.`);
		}
		const einzelanker = sitz.filter((z) => plan(z) === "SO" && !stegAnker.has(z));
		for (const z of einzelanker) neu.push(pos$1("GOZ", "5030", z), pos$1("GOZ", "5080", z), pos$1("BEB", "3027", z));
		if (einzelanker.length) hinweis(`Locator, Druckknopf oder Kugelkopf ${einzelanker.join(", ")}: GOZ 5030 je Implantat und GOZ 5080 je Verbindungselement. Matrize und Patrize sind ein Element, die Verschraubung der Kappe steckt in 5030.`);
		if (prothese === "andersartig" && prothesenZaehne.length) {
			const n = prothesenZaehne.length;
			if (zahnlos) {
				neu.push(pos$1("GOZ", kiefer === "OK" ? "5220" : "5230", kiefer), pos$1("GOZ", kiefer === "OK" ? "5180" : "5190", kiefer));
				neu.push(pos$1("BEB", "6001", kiefer), pos$1("BEB", "6002", kiefer, n), pos$1("BEB", "6301", kiefer), pos$1("BEB", "6302", kiefer, n));
			} else {
				neu.push(pos$1("GOZ", "5210", kiefer));
				for (const l of laeufe((z) => PROTHESENZAHN$1.test(plan(z)) && !STEGZAHN$1.test(plan(z)))) if (!prothesenSpannen.has(spanne$1(l.zaehne)) && [l.links, l.rechts].some((x) => !!x && PFEILERKRONE$1.test(plan(x)))) neu.push(pos$1("GOZ", "5070", spanne$1(l.zaehne)));
				neu.push(pos$1("BEB", "4001", kiefer), pos$1("BEB", "6001", kiefer), pos$1("BEB", "6003", kiefer, n), pos$1("BEB", "6311", kiefer), pos$1("BEB", "6312", kiefer, n));
			}
			hinweis(`${kieferName}: ${implantatProthese ? "implantatgetragene Prothese" : regelProthese ? "Prothese mit anderer Verankerung" : "Prothese statt Brücke"} – andersartige Versorgung, Leistungen nach GOZ/BEB.`);
		}
		for (const z of sitz) {
			if (!tp[z] || !/^SK/.test(tp[z]) || !anders.has(z) || !GLIED$2.test(R[z] ?? "")) continue;
			const i = sitz.indexOf(z);
			const [l, r] = [sitz[i - 1], sitz[i + 1]];
			if (l && r && !B(l) && !B(r) && !GLIED$2.test(R[l] ?? "") && !GLIED$2.test(R[r] ?? "")) hinweis(`Implantat ${z} in einer Einzelzahnlücke mit gesunden Nachbarzähnen: liegt ein Ausnahmefall nach Nr. 36 a) ZE-Richtlinie vor (keine Parodontalbehandlung nötig), ist die Suprakonstruktion Regel- bzw. gleichartige Versorgung (BEMA 20 i/19 i). Berechnet ist der Normalfall (andersartig, GOZ 2270).`);
		}
	}
	const einheiten = positionen.filter((p) => p.ebene === "BEL" && EINHEIT_BEL.has(p.nr)).reduce((s, p) => s + p.anzahl, 0);
	const belArbeit = positionen.some((p) => p.ebene === "BEL" && ZAHNARBEIT_BEL.test(p.nr));
	const bebKiefer = new Set(neu.filter((p) => p.ebene === "BEB" && /^\d\d$/.test(p.zahn) && !(tp[p.zahn] ?? R[p.zahn] ?? "").startsWith("S")).map((p) => kieferVon$1(p.zahn)));
	const bebArbeit = neu.some((p) => p.ebene === "BEB" && /^\d\d$/.test(p.zahn));
	positionen = positionen.flatMap((p) => {
		if (p.ebene !== "BEL") return [p];
		if (p.nr === "9700") return einheiten ? [{
			...p,
			anzahl: einheiten
		}] : [];
		if (belArbeit || ![
			"0010",
			"0051",
			"0120"
		].includes(p.nr) || p.nr !== "0051" && p.zahn !== "") return [p];
		if (!bebArbeit) return [];
		if (p.nr === "0010") return [{
			...p,
			ebene: "BEB",
			nr: "0002"
		}];
		if (p.nr === "0120") return [{
			...p,
			ebene: "BEB",
			nr: "0402"
		}];
		const k = zahnListe$1(p.zahn).filter((x) => bebKiefer.has(x));
		return k.length ? [{
			...p,
			ebene: "BEB",
			nr: "0021",
			zahn: k.join(","),
			anzahl: k.length
		}] : [];
	});
	return {
		...regel,
		positionen: [...positionen, ...neu],
		hinweise
	};
}
//#endregion
//#region ../HKP/src/engine/regeln.ts
var zaehler = 0;
var id = () => `auto-${Date.now().toString(36)}-${(zaehler++).toString(36)}`;
function pos(ebene, nr, zahn, anzahl = 1) {
	return {
		id: id(),
		ebene,
		nr,
		zahn,
		anzahl,
		auto: true
	};
}
function befund(nr, zahnGebiet, anzahl = 1) {
	return {
		id: id(),
		nr,
		zahnGebiet,
		anzahl,
		auto: true
	};
}
var kuerzel = (z) => (z?.B ?? "").trim().toLowerCase();
/** i: Implantat ohne Suprakonstruktion. ix: schon als nicht erhaltungswürdig markiert. */
var implantatNackt = (k) => k === "i" || k === "ix";
/** Analysiert einen Kiefer: vorhandene Zähne, Lücken, Freiend */
function kieferAnalyse(reihe, zaehne) {
	const sitz = reihe.filter((z) => kuerzel(zaehne[z]) !== ")(");
	const fehlt = (z) => FEHLEND.has(kuerzel(zaehne[z]));
	const vorhanden = sitz.filter((z) => !fehlt(z) && !implantatNackt(kuerzel(zaehne[z])));
	const fehlendOhne8 = sitz.filter((z) => fehlt(z) && !istWeisheitszahn$1(z));
	const luecken = [];
	let start = -1;
	for (let i = 0; i < sitz.length; i++) if (fehlt(sitz[i])) {
		if (start < 0) start = i;
	} else {
		if (start > 0) luecken.push({
			zaehne: sitz.slice(start, i),
			vor: sitz[start - 1],
			nach: sitz[i]
		});
		start = -1;
	}
	const freiendSeiten = [];
	for (const seite of [sitz, [...sitz].reverse()]) {
		const distal = [];
		for (const z of seite) {
			if (!fehlt(z)) break;
			distal.push(z);
		}
		const ohne8 = distal.filter((z) => !istWeisheitszahn$1(z));
		const bedarf = ohne8.some((z) => VERSORGUNG_NOETIG.has(kuerzel(zaehne[z])));
		if (ohne8.length >= 2 || ohne8.length === 1 && bedarf && kuerzel(zaehne[ohne8[0]]) !== "f") freiendSeiten.push({
			zaehne: ohne8,
			bedarf
		});
	}
	return {
		sitz,
		vorhanden,
		fehlendOhne8,
		luecken,
		freiendSeiten,
		fehlt
	};
}
/**
* Endpfeiler einer bis zum Eckzahn oder ersten Prämolaren verkürzten oder unterbrochenen Zahnreihe
* (mindestens zwei nebeneinander fehlende Zähne distal davon) – Voraussetzung für Befund 3.2.
*/
function endpfeiler32(seite, fehlt) {
	const anPosition = (p) => seite.find((z) => Number(z[1]) === p);
	const fehltPos = (p) => {
		const z = anPosition(p);
		return !z || fehlt(z);
	};
	for (const p of [4, 3]) {
		const z = anPosition(p);
		if (z && !fehlt(z) && fehltPos(p + 1) && fehltPos(p + 2)) return z;
	}
}
var IMPLANTAT_ERNEUERUNG = /* @__PURE__ */ new Set(["skw", "sbw"]);
var IMPLANTAT_PROTHESE = /* @__PURE__ */ new Set([
	"sew",
	"sow",
	"stw"
]);
var istImplantat = (k) => k.startsWith("s");
/** Alle planbezogenen Eingaben der Regelengine außer dem Zahnschema */
var regelOptionen = (plan) => ({
	...plan.weitere,
	klinisch: plan.klinisch,
	reparaturen: plan.reparaturen
});
var KRONE_R = /^(K|KV|KH|KVH|PK|T|TV|T2|T2V|R)$/;
/** Zuschlagsbefunde aus klinischen Angaben (1.4, 1.5, 2.6, 4.5, 4.9, 7.6) */
function zuschlaegeAnsetzen(k, R, anker, befunde, positionen, hinweise) {
	const hatKrone = (z) => KRONE_R.test(R[z] ?? "") || anker.has(z);
	const spaeter = new Set(k.stiftNachtraeglich ?? []);
	const stift = (nr, z, ...ps) => {
		const n = spaeter.has(z) ? { nachtraeglich: true } : {};
		befunde.push({
			...befund(nr, z),
			...n
		});
		positionen.push(...ps.map((p) => ({
			...p,
			...n
		})));
		if (!hatKrone(z)) hinweise.push(`Zahn ${z}: Stiftaufbau (${nr}) ohne geplante Krone – Befund nur zusammen mit einer Überkronung ansetzbar.`);
	};
	const gesehen = /* @__PURE__ */ new Set();
	for (const [liste, nr, ps] of [
		[
			k.stiftKonfektioniert,
			"1.4",
			(z) => [pos("BEMA", "18a", z)]
		],
		[
			k.stiftGegossen,
			"1.5",
			(z) => [pos("BEMA", "18b", z), pos("BEL", "1050", z)]
		],
		[
			k.stiftAdhaesiv,
			"1.4",
			(z) => [
				pos("GOZ", "2180", z),
				pos("GOZ", "2195", z),
				pos("GOZ", "2197", z)
			]
		]
	]) for (const z of liste ?? []) {
		if (gesehen.has(z)) {
			hinweise.push(`Zahn ${z}: mehrere Stiftaufbauten angegeben – je Zahn nur ein Befund 1.4 oder 1.5.`);
			continue;
		}
		gesehen.add(z);
		stift(nr, z, ...ps(z));
	}
	for (const z of spaeter) if (!gesehen.has(z)) hinweise.push(`Zahn ${z}: als nachträglicher Stiftbefund markiert, aber kein Stiftaufbau angegeben.`);
	const disparallel = new Set(k.disparallel ?? []);
	const luecken = befunde.filter((b) => /^2\.[1-5]$/.test(b.nr));
	for (const z of disparallel) if (!anker.has(z)) hinweise.push(`Zahn ${z}: als disparallel markiert, ist aber kein Brückenanker (2.6 nur bei festsitzender Brücke).`);
	for (const l of luecken) {
		const pfeiler = l.zahnGebiet.split("-").find((z) => disparallel.has(z));
		if (!pfeiler) continue;
		befunde.push(befund("2.6", l.zahnGebiet));
		positionen.push(pos("BEMA", "91e", pfeiler), pos("BEL", "1341", pfeiler));
	}
	const total = (kiefer) => befunde.some((b) => /^4\.[1-4]$/.test(b.nr) && b.zahnGebiet === kiefer);
	for (const kiefer of ["OK", "UK"]) {
		if (!k[kiefer === "OK" ? "metallbasisOK" : "metallbasisUK"]) continue;
		if (total(kiefer)) {
			befunde.push(befund("4.5", kiefer));
			positionen.push(pos("BEMA", "98e", kiefer), pos("BEL", "2010", kiefer));
		} else hinweise.push(`${kiefer}: Metallbasis (4.5) nur bei Total- oder schleimhautgetragener Deckprothese (Befund 4.1–4.4), nicht bei Modellguss.`);
	}
	if (k.stuetzstift) {
		const kiefer = ["OK", "UK"].filter(total);
		if (kiefer.length) {
			befunde.push(befund("4.9", kiefer.join(",")));
			positionen.push(pos("BEMA", "98d", kiefer[0]), pos("BEL", "0214", kiefer[0]), pos("BEL", "0230", kiefer[0]));
		} else hinweise.push("Stützstiftregistrierung (4.9) nur bei Total- oder schleimhautgetragener Deckprothese (Befund 4.1–4.4).");
	}
	for (const kiefer of ["OK", "UK"]) {
		if (!k[kiefer === "OK" ? "atrophieOK" : "atrophieUK"]) continue;
		if (!befunde.some((b) => b.nr === "7.5" && b.zahnGebiet === kiefer)) {
			hinweise.push(`${kiefer}: atrophierter Kiefer (7.6) nur als Zuschlag zu Befund 7.5 (implantatgetragene Prothese).`);
			continue;
		}
		const konnektoren = Object.entries(R).filter(([z, r]) => kieferVon$1(z) === kiefer && (r === "SO" || r === "ST")).length;
		if (!konnektoren) {
			hinweise.push(`${kiefer}: 7.6 je implantatgetragenem Konnektor – im Zahnschema keine Konnektoren (sow/stw) eingetragen.`);
			continue;
		}
		befunde.push(befund("7.6", kiefer, Math.min(konnektoren, 4)));
		if (konnektoren > 4) hinweise.push(`${kiefer}: 7.6 höchstens viermal je Kiefer (${konnektoren} Konnektoren).`);
		hinweise.push(`${kiefer}: Ausnahmefall Nr. 36 ZE-Richtlinie (atrophierter zahnloser Kiefer) – Regelversorgung nach BEMA mit Implantat-Kennzeichnung, bitte Leistungen prüfen.`);
	}
}
function regelversorgungErmitteln(zaehne, optionen = {}) {
	zaehler = 0;
	const R = {};
	const befunde = [];
	const positionen = [];
	const hinweise = [];
	const anker = /* @__PURE__ */ new Set();
	const glieder = /* @__PURE__ */ new Set();
	const teleskope = /* @__PURE__ */ new Set();
	const verblend27 = [];
	let festsitzend = false;
	const prothesenKiefer = [];
	const teleskopAnker = (z, nr) => {
		teleskope.add(z);
		befunde.push(befund(nr, z));
		R[z] = imVerblendbereich(z) ? "TV" : "T";
		if (imVerblendbereich(z)) befunde.push(befund("4.7", z));
		positionen.push(pos("BEMA", "91d", z), pos("BEMA", "19", z), pos("BEL", "1200", z));
		if (imVerblendbereich(z)) positionen.push(pos("BEL", "1620", z));
	};
	const dran = (k) => !optionen.nurKiefer?.length || optionen.nurKiefer.includes(k);
	for (const [kiefer, reihe] of [["OK", OBERKIEFER$1], ["UK", UNTERKIEFER$1]]) {
		if (!dran(kiefer)) continue;
		const a = kieferAnalyse(reihe, zaehne);
		const kieferName = kiefer === "OK" ? "Oberkiefer" : "Unterkiefer";
		const versorgungsLuecken = a.luecken.filter((l) => l.zaehne.some((z) => VERSORGUNG_NOETIG.has(kuerzel(zaehne[z]))));
		const neuVersorgung = versorgungsLuecken.length > 0 || a.freiendSeiten.some((f) => f.bedarf);
		for (const z of a.sitz) if (kuerzel(zaehne[z]) === "x") hinweise.push(`Zahn ${z} ist nicht erhaltungswürdig (x) und wird als fehlend geplant.`);
		if (kiefer === "OK" ? optionen.interimOK : optionen.interimUK) {
			const n = a.fehlendOhne8.length;
			if (a.vorhanden.length === 0) befunde.push(befund("5.4", kiefer));
			else if (n > 0) befunde.push(befund(n <= 4 ? "5.1" : n <= 8 ? "5.2" : "5.3", kiefer));
			if (a.vorhanden.length === 0) positionen.push(pos("BEMA", kiefer === "OK" ? "97a" : "97b", kiefer));
			else if (n > 0) positionen.push(pos("BEMA", n <= 4 ? "96a" : n <= 8 ? "96b" : "96c", kiefer));
			for (const z of a.fehlendOhne8) if (!istImplantat(kuerzel(zaehne[z]))) R[z] = "E";
			if (n > 0) hinweise.push(`${kieferName}: Interimsprothese (Befund 5.x) – zahntechnische Leistungen bitte ergänzen.`);
			else hinweise.push(`${kieferName}: Interimsversorgung angekreuzt, aber kein fehlender Zahn im Befund.`);
			continue;
		}
		const t2w = a.sitz.filter((z) => kuerzel(zaehne[z]) === "t2w");
		if (t2w.length && neuVersorgung) hinweise.push(`${kieferName}: t2w bei Neuversorgung des Kiefers – das Teleskop wird mit der neuen Prothese geplant; 6.10 nur bei Erhalt der Prothese.`);
		else if (t2w.length) {
			for (const z of t2w) {
				const verblend = imVerblendbereich(z);
				teleskope.add(z);
				R[z] = verblend ? "T2V" : "T2";
				befunde.push(befund("6.10", z));
				if (verblend) befunde.push(befund("4.7", z));
				positionen.push(pos("BEMA", "91d", z), pos("BEL", "1201", z));
				if (verblend) positionen.push(pos("BEL", "1620", z));
			}
			befunde.push(befund("6.3", kiefer));
			positionen.push(pos("BEMA", "100b", kiefer), pos("BEL", "0010", kiefer), pos("BEL", "8010", kiefer), pos("BEL", "8070", kiefer));
			hinweise.push(`${kieferName}: Sekundärteleskop ${t2w.join(", ")} erneuern (6.10) mit Einarbeitung in die Prothese (6.3, Modellgussbasis). Bei schleimhautgetragener Deckprothese stattdessen 6.2.`);
		}
		const zahnlosTrotzImplantat = a.vorhanden.length === 0 && a.sitz.some((z) => implantatNackt(kuerzel(zaehne[z])));
		if (!neuVersorgung && !zahnlosTrotzImplantat) continue;
		if (a.vorhanden.length <= 3) {
			const nr = a.vorhanden.length === 0 ? kiefer === "OK" ? "4.2" : "4.4" : kiefer === "OK" ? "4.1" : "4.3";
			befunde.push(befund(nr, kiefer));
			const luecke = (z) => a.fehlt(z) || implantatNackt(kuerzel(zaehne[z]));
			for (const z of a.sitz) if (luecke(z) && !istWeisheitszahn$1(z) && kuerzel(zaehne[z]) !== "rw" && !istImplantat(kuerzel(zaehne[z]))) R[z] = "E";
			prothesenKiefer.push(kiefer);
			positionen.push(pos("BEMA", kiefer === "OK" ? "97a" : "97b", kiefer));
			positionen.push(pos("BEMA", kiefer === "OK" ? "98b" : "98c", kiefer));
			const n = a.sitz.filter((z) => luecke(z) && !istWeisheitszahn$1(z)).length;
			positionen.push(pos("BEL", "0010", kiefer, 2), pos("BEL", "0211", kiefer), pos("BEL", "0213", kiefer), pos("BEL", "0220", kiefer), pos("BEL", "0120", kiefer), pos("BEL", "3010", kiefer), pos("BEL", "3020", kiefer, n), pos("BEL", "3610", kiefer), pos("BEL", "3620", kiefer, n));
			for (const z of a.vorhanden) {
				const k = kuerzel(zaehne[z]);
				if (k === "t" || istImplantat(k)) continue;
				teleskopAnker(z, "4.6");
			}
			for (const z of a.sitz.filter((z) => kuerzel(zaehne[z]) === "rw")) {
				befunde.push(befund("4.8", z));
				R[z] = "R";
				positionen.push(pos("BEMA", "90", z), pos("BEL", "1013", z), pos("BEL", "1343", z));
			}
			if (a.vorhanden.length > 0) hinweise.push(`${kieferName}: Restzahnbestand bis 3 Zähne – Kombinationsversorgung mit Teleskopkronen (4.6/4.7) angesetzt. Notwendigkeit der dentalen Verankerung bitte prüfen.`);
			continue;
		}
		if (a.freiendSeiten.length === 0 && a.fehlendOhne8.length <= 4 && versorgungsLuecken.every((l) => l.zaehne.length <= 3 || l.zaehne.length === 4 && l.zaehne.every(istFrontzahn$1))) {
			festsitzend = true;
			let vorherige;
			for (const l of versorgungsLuecken) {
				const n = l.zaehne.length;
				let nr = n === 1 ? "2.1" : n === 2 ? "2.2" : n === 3 ? "2.3" : "2.4";
				if (n === 1 && vorherige && vorherige.nach === l.vor) nr = "2.5";
				befunde.push(befund(nr, `${l.vor}-${l.nach}`));
				for (const z of [l.vor, l.nach]) {
					anker.add(z);
					R[z] = imVerblendbereich(z) ? "KV" : "K";
				}
				for (const z of l.zaehne) {
					glieder.add(z);
					R[z] = imVerblendbereich(z) ? "BV" : "B";
				}
				positionen.push(pos("BEMA", "92", `${l.vor}-${l.nach}`));
				vorherige = l;
			}
			continue;
		}
		befunde.push(befund("3.1", kiefer));
		prothesenKiefer.push(kiefer);
		const zuErsetzen = a.sitz.filter((z) => a.fehlt(z) && !istImplantat(kuerzel(zaehne[z])) && (!istWeisheitszahn$1(z) || a.sitz.includes(`${z[0]}7`) && a.fehlt(`${z[0]}7`)));
		for (const z of zuErsetzen) R[z] = "E";
		const halte = /* @__PURE__ */ new Set();
		for (let i = 0; i < a.sitz.length; i++) {
			const z = a.sitz[i];
			if (a.fehlt(z)) continue;
			if (i > 0 && a.fehlt(a.sitz[i - 1]) || i < a.sitz.length - 1 && a.fehlt(a.sitz[i + 1])) halte.add(z);
		}
		const seite = (q) => a.sitz.filter((z) => q.includes(z[0])).sort((x, y) => Number(x[1]) - Number(y[1]));
		const pfeiler32 = [endpfeiler32(seite(["1", "4"]), a.fehlt), endpfeiler32(seite(["2", "3"]), a.fehlt)];
		if (pfeiler32[0] && pfeiler32[1]) {
			for (const z of pfeiler32) {
				halte.delete(z);
				teleskopAnker(z, "3.2");
			}
			hinweise.push(`${kieferName}: Befund 3.2 – Kombinationsversorgung mit Teleskopkronen an ${pfeiler32.join(" und ")}. Notwendigkeit der dentalen Verankerung bitte prüfen.`);
		}
		for (const z of halte) R[z] = KRONE_NOETIG.has(kuerzel(zaehne[z])) ? imVerblendbereich(z) ? "KVH" : "KH" : "H";
		const n = zuErsetzen.length;
		positionen.push(pos("BEMA", n <= 4 ? "96a" : n <= 8 ? "96b" : "96c", kiefer));
		positionen.push(pos("BEMA", "98g", kiefer));
		if (halte.size) positionen.push(pos("BEMA", halte.size >= 2 ? "98h/2" : "98h/1", kiefer));
		positionen.push(pos("BEL", "0010", kiefer, 2), pos("BEL", "0021", kiefer), pos("BEL", "0213", kiefer), pos("BEL", "0220", kiefer), pos("BEL", "0120", kiefer), pos("BEL", "2010", kiefer));
		hinweise.push(`${kieferName}: Modellguss – BEMA 98a und BEL 0211 nur bei Abformung mit individuellem Löffel ergänzen (in den Berechnungsbeispielen des Kompendiums nicht enthalten).`);
		if (halte.size) positionen.push(pos("BEL", "2031", [...halte].join(","), halte.size));
		positionen.push(pos("BEL", "3010", kiefer), pos("BEL", "3030", kiefer, n), pos("BEL", "3610", kiefer), pos("BEL", "3620", kiefer, n));
	}
	for (const [kiefer, reihe] of [["OK", OBERKIEFER$1], ["UK", UNTERKIEFER$1]]) {
		if (!dran(kiefer)) continue;
		const natuerlich = (z) => {
			if (!z) return false;
			const k = kuerzel(zaehne[z]);
			return !FEHLEND.has(k) && !istImplantat(k);
		};
		let n72 = 0;
		for (let i = 0; i < reihe.length; i++) {
			const z = reihe[i];
			const k = kuerzel(zaehne[z]);
			if (!IMPLANTAT_ERNEUERUNG.has(k)) continue;
			if (k === "skw" && natuerlich(reihe[i - 1]) && natuerlich(reihe[i + 1])) befunde.push(befund("7.1", z));
			else if (n72 < 4) {
				befunde.push(befund("7.2", z));
				n72++;
			} else hinweise.push(`Zahn ${z}: Befund 7.2 ist höchstens viermal je Kiefer ansetzbar.`);
			const verblend = imVerblendbereich(z);
			R[z] = (k === "skw" ? "SK" : "SB") + (verblend ? "V" : "");
			if (k === "skw" && verblend) befunde.push(befund("1.3", z));
			const zuo = TP_ZUORDNUNG[R[z]];
			if (zuo.goz) positionen.push(pos("GOZ", zuo.goz, z));
			for (const b of zuo.beb) positionen.push(pos("BEB", b, z));
		}
		const prothese = reihe.filter((z) => IMPLANTAT_PROTHESE.has(kuerzel(zaehne[z])));
		if (prothese.length) {
			befunde.push(befund("7.5", kiefer));
			for (const z of prothese) R[z] = kuerzel(zaehne[z]).slice(0, 2).toUpperCase();
			const zahnlos = reihe.filter((z) => !istWeisheitszahn$1(z)).every((z) => !natuerlich(z));
			const ersetzt = reihe.filter((z) => /^se/.test(kuerzel(zaehne[z]))).length;
			const konnektoren = reihe.filter((z) => kuerzel(zaehne[z]) === "sow").length;
			const sekundaer = reihe.filter((z) => kuerzel(zaehne[z]) === "stw").length;
			if (zahnlos) {
				positionen.push(pos("GOZ", kiefer === "OK" ? "5220" : "5230", kiefer), pos("GOZ", kiefer === "OK" ? "5180" : "5190", kiefer));
				if (konnektoren) positionen.push(pos("GOZ", "5090", kiefer, konnektoren));
				positionen.push(pos("BEB", "0018", kiefer), pos("BEB", "1108", kiefer), pos("BEB", "6001", kiefer), pos("BEB", "6002", kiefer, ersetzt), pos("BEB", "6301", kiefer), pos("BEB", "6302", kiefer, ersetzt));
			} else {
				positionen.push(pos("GOZ", "5210", kiefer));
				if (sekundaer) positionen.push(pos("GOZ", "5100", kiefer, sekundaer));
				positionen.push(pos("BEB", "0018", kiefer), pos("BEB", "4001", kiefer), pos("BEB", "6001", kiefer), pos("BEB", "6003", kiefer, ersetzt), pos("BEB", "6311", kiefer), pos("BEB", "6312", kiefer, ersetzt));
			}
			hinweise.push(`${kiefer === "OK" ? "Oberkiefer" : "Unterkiefer"}: Implantatgetragene Prothesenkonstruktion (Befund 7.5) – Leistungen nach GOZ/BEB vorgeschlagen, bitte prüfen. Natürliche Pfeiler (tw) werden gesondert geplant.`);
		}
		if (reihe.some((z) => IMPLANTAT_ERNEUERUNG.has(kuerzel(zaehne[z])))) hinweise.push(`${kiefer === "OK" ? "Oberkiefer" : "Unterkiefer"}: Suprakonstruktionen werden nach GOZ/BEB abgerechnet; der Festzuschuss richtet sich nach Befund 7.1/7.2. Implantologische Leistungen gehören nicht in den HKP.`);
	}
	for (const z of [...OBERKIEFER$1, ...UNTERKIEFER$1]) {
		const k = kuerzel(zaehne[z]);
		if (anker.has(z) || glieder.has(z) || teleskope.has(z)) continue;
		if (KRONE_NOETIG.has(k)) {
			festsitzend = true;
			befunde.push(befund("1.1", z));
			if (!R[z]?.endsWith("H")) R[z] = imVerblendbereich(z) ? "KV" : "K";
			if (imVerblendbereich(z)) befunde.push(befund("1.3", z));
			positionen.push(pos("BEMA", imVerblendbereich(z) ? "20b" : "20a", z), pos("BEMA", "19", z));
		} else if (TEILKRONE_NOETIG.has(k)) {
			festsitzend = true;
			befunde.push(befund("1.2", z));
			R[z] = "PK";
			positionen.push(pos("BEMA", "20c", z), pos("BEMA", "19", z));
		}
	}
	for (const z of anker) {
		positionen.push(pos("BEMA", imVerblendbereich(z) ? "91b" : "91a", z), pos("BEMA", "19", z));
		if (imVerblendbereich(z)) verblend27.push(z);
	}
	for (const z of glieder) {
		positionen.push(pos("BEMA", "19", z));
		if (imVerblendbereich(z)) verblend27.push(z);
	}
	if (verblend27.length) befunde.push(befund("2.7", verblend27.join(","), verblend27.length));
	for (const z of Object.keys(R)) {
		const r = R[z];
		if (r === "K" || r === "KH") positionen.push(pos("BEL", "1021", z));
		if (r === "KV" || r === "KVH") positionen.push(pos("BEL", "1024", z), pos("BEL", "1620", z));
		if (r === "PK") positionen.push(pos("BEL", "1022", z));
		if (r === "B") positionen.push(pos("BEL", "1100", z));
		if (r === "BV") positionen.push(pos("BEL", "1100", z), pos("BEL", "1620", z));
	}
	const einheiten = Object.values(R).filter((r) => /^(K|KV|KH|KVH|PK|B|BV)$/.test(r)).length;
	if (festsitzend && einheiten) {
		const kiefer = new Set(Object.keys(R).filter((z) => /^(K|KV|KH|KVH|PK|B|BV)$/.test(R[z])).map((z) => z[0] <= "2" ? "OK" : "UK"));
		positionen.push(pos("BEL", "0010", "", 1), pos("BEL", "0051", [...kiefer].join(","), kiefer.size), pos("BEL", "0120", ""));
		positionen.push(pos("BEL", "9700", "", einheiten));
	}
	zuschlaegeAnsetzen(optionen.klinisch ?? {}, R, anker, befunde, positionen, hinweise);
	const neuePlanung = befunde.some((b) => !b.nr.startsWith("6.") && !(b.nr === "4.7" && R[b.zahnGebiet]?.startsWith("T2")));
	const rep = reparaturenAnwenden(optionen.reparaturen ?? []);
	befunde.push(...rep.befunde);
	positionen.push(...rep.positionen);
	hinweise.push(...new Set(rep.hinweise));
	if (neuePlanung) {
		positionen.unshift(pos("BEMA", "7b", ""));
		positionen.push(pos("BEL", "9330", "", 2));
	}
	if (!befunde.length) hinweise.push("Aus Zeile B ergibt sich kein Versorgungsbedarf.");
	return {
		R,
		befunde,
		positionen,
		hinweise
	};
}
/**
* Ersetzt für Zähne mit Therapieplanung (TP ≠ R) die zahnärztlichen Leistungen durch GOZ
* und die zahntechnischen durch BEB. Provisorien und fallbezogene Leistungen bleiben im BEMA/BEL.
*/
function therapieAnwenden(regel, zaehne, plan) {
	const r = therapieplanAnwenden(regel, zaehne);
	if (!plan) return r;
	const mitR = {
		...zaehne,
		...Object.fromEntries(Object.entries(r.R).map(([z, R]) => [z, {
			...zaehne[z] ?? {
				B: "",
				TP: ""
			},
			R
		}]))
	};
	const implantatAbf = implantatAbformung(plan);
	const imp = implantatPositionen(mitR, {
		...plan.implantat,
		abformung: implantatAbf
	}, plan.einstellungen.labor === "gewerbe" ? "fremd" : void 0);
	const abformung = plan.abformung || (implantatAbf === "scan" && imp.positionen.length ? "scan" : "");
	const abf = abformungAnwenden([...r.positionen, ...imp.positionen], mitR, abformung, plan.abformungProthese ?? "", plan.einstellungen.labor === "praxis", plan.einstellungen.protheseDigital ?? "voll");
	return {
		...r,
		positionen: abf.positionen,
		hinweise: [
			...r.hinweise,
			...imp.hinweise,
			...abf.hinweise
		]
	};
}
//#endregion
//#region ../HKP/src/engine/eigenlabor.ts
var bebNorm$1 = (s) => s.trim().padStart(4, "0");
var beb_itz_2024_default$1 = {
	typ: "beb",
	name: "BEB Preisliste ITZ GmbH (Stand 23.01.2024)",
	gueltigAb: "2024-01-23",
	quelle: "https://itzgmbh.de/wp-content/uploads/BEB-2024.pdf",
	hinweis: "Per Texterkennung aus einem Scan übernommen – Preise vor Verwendung prüfen.",
	eintraege: [
		{
			"nr": "0001",
			"text": "Modell aus Hartgips",
			"preis": 10.4
		},
		{
			"nr": "0002",
			"text": "Modell aus Superhartgips",
			"preis": 10.4
		},
		{
			"nr": "0004",
			"text": "Modell nach Überabformung",
			"preis": 23.64
		},
		{
			"nr": "0007",
			"text": "Kontrollmodell",
			"preis": 10.4
		},
		{
			"nr": "0009",
			"text": "Modell aus Kunststoff",
			"preis": 23
		},
		{
			"nr": "0010",
			"text": "Spezialmodell",
			"preis": 23
		},
		{
			"nr": "0018",
			"text": "Modell bei Implantatversorgung",
			"preis": 10.4
		},
		{
			"nr": "0019",
			"text": "Frässmodell",
			"preis": 16
		},
		{
			"nr": "0020",
			"text": "Remontage-Modell",
			"preis": 10.4
		},
		{
			"nr": "0021",
			"text": "Sägemodell",
			"preis": 23
		},
		{
			"nr": "0023",
			"text": "Modell für Einzelstümpfe",
			"preis": 10.4
		},
		{
			"nr": "0024",
			"text": "Verwendung Kunststoff",
			"preis": 19.64
		},
		{
			"nr": "0029",
			"text": "Keramikstufe",
			"preis": 40
		},
		{
			"nr": "0033",
			"text": "Bissgabel nach Gauge",
			"preis": 15
		},
		{
			"nr": "0036",
			"text": "Versandkosten bei Datenlieferung",
			"preis": 8.52
		},
		{
			"nr": "0037",
			"text": "Konstruieren und Fräsen einer Basis aus Kunststoff",
			"preis": 102
		},
		{
			"nr": "0039",
			"text": "Interimsprothese aus Polyamid",
			"preis": 199
		},
		{
			"nr": "0040",
			"text": "Interimsprothese aus Polyamid",
			"preis": 249
		},
		{
			"nr": "0042",
			"text": "Fräsen eines Sekundärteils NEM",
			"preis": 138
		},
		{
			"nr": "0105",
			"text": "Stumpf aus Kunststoff",
			"preis": 8.5
		},
		{
			"nr": "0217",
			"text": "Stumpf unter Mikroskop vorbereiten",
			"preis": 5.5
		},
		{
			"nr": "0221",
			"text": "Hilfsteil in Abdruck",
			"preis": 9
		},
		{
			"nr": "0223",
			"text": "Zahnfleischmaske, abnehmbar je Kieferhälfte",
			"preis": 31
		},
		{
			"nr": "0224",
			"text": "Modellimplantat repositionieren",
			"preis": 11
		},
		{
			"nr": "0225",
			"text": "Implantatpfosten auf Modellierimplantat aufschrauben",
			"preis": 6.2
		},
		{
			"nr": "0241",
			"text": "Dublieren eines Modelles oder Modellteiles",
			"preis": 21.33
		},
		{
			"nr": "0243",
			"text": "Dublieren eines Einzelstumpfes",
			"preis": 13.66
		},
		{
			"nr": "0251",
			"text": "Angeliefertes Modell untersockeln",
			"preis": 10.4
		},
		{
			"nr": "0252",
			"text": "Angeliefertes Modell oder Zahnkranz bearbeiten",
			"preis": 10.4
		},
		{
			"nr": "0253",
			"text": "Split-Cast Sockel an Modell: Erklärung und Preis",
			"preis": 10.4
		},
		{
			"nr": "0301",
			"text": "Zahn vermessen",
			"preis": 5
		},
		{
			"nr": "0302",
			"text": "Modell vermessen",
			"preis": 7
		},
		{
			"nr": "0307",
			"text": "Radieren des Abschlussrandes",
			"preis": 11
		},
		{
			"nr": "0401",
			"text": "Montage eines Modellpaares in Fixator",
			"preis": 13.07
		},
		{
			"nr": "0402",
			"text": "Modellmontage in Mittelwertartikulator I",
			"preis": 14.75
		},
		{
			"nr": "0403",
			"text": "Modellmontage in Mittelwertartikulator II",
			"preis": 16.2
		},
		{
			"nr": "0404",
			"text": "Modellmontage in Mittelwert nach Gesichtsbogen",
			"preis": 26.5
		},
		{
			"nr": "0405",
			"text": "Modellmontage in individuellen Artikulator II",
			"preis": 16.2
		},
		{
			"nr": "0408",
			"text": "Montage eines Gegenkiefermodelles",
			"preis": 7.7
		},
		{
			"nr": "0511",
			"text": "Mehraufwand für Einstellen nach Zentrikregistrat",
			"preis": 7.7
		},
		{
			"nr": "0521",
			"text": "Auswerten eines Registrates",
			"preis": 25.5
		},
		{
			"nr": "0522",
			"text": "Frontzahnführungsteller individuell",
			"preis": 26.5
		},
		{
			"nr": "0523",
			"text": "Pfeilwinkel auf Frontzahnführungsteller übertragen",
			"preis": 26.5
		},
		{
			"nr": "0601",
			"text": "Modellpaar trimmen, okklusionsbezogen",
			"preis": 11
		},
		{
			"nr": "0602",
			"text": "Modellpaar sockeln, dreidimensional",
			"preis": 11
		},
		{
			"nr": "0701",
			"text": "Versand je Versandgang",
			"preis": 8.52
		},
		{
			"nr": "0702",
			"text": "Sonderversand oder Fahrtkosten",
			"preis": 25
		},
		{
			"nr": "0703",
			"text": "Versand UPS Express bis 12:00",
			"preis": 14
		},
		{
			"nr": "0705",
			"text": "nachträgliche Farbanpassung im Labor",
			"preis": 58
		},
		{
			"nr": "0706",
			"text": "Foto oder Video Dokumentation",
			"preis": 10
		},
		{
			"nr": "0710",
			"text": "Eilterminzuschlag",
			"preis": 1
		},
		{
			"nr": "0721",
			"text": "Zeiteinheit, Zahntechniker-Meister je 15 Min",
			"preis": 28.5
		},
		{
			"nr": "0722",
			"text": "Zeiteinheit, Zahntechniker je 15 Min",
			"preis": 20
		},
		{
			"nr": "0723",
			"text": "Zahnfarbenbestimmung im Labor",
			"preis": 30
		},
		{
			"nr": "0724",
			"text": "Zahnfarbenbestimmung in der Praxis incl. Anfahrt",
			"preis": 45
		},
		{
			"nr": "0731",
			"text": "Individuelle Namenskennzeichnung",
			"preis": 35
		},
		{
			"nr": "0732",
			"text": "Desinfektion",
			"preis": 1.8
		},
		{
			"nr": "0801",
			"text": "Prothetische Planung",
			"preis": 15
		},
		{
			"nr": "0802",
			"text": "Prothetische Alternativplanung",
			"preis": 10
		},
		{
			"nr": "0811",
			"text": "Modellanalyse für Prothetik",
			"preis": 15
		},
		{
			"nr": "0821",
			"text": "Kostenvoranschlag",
			"preis": 15
		},
		{
			"nr": "0833",
			"text": "Set-Up/WaxUp/MockUp - je Zahn",
			"preis": 19
		},
		{
			"nr": "1002",
			"text": "Basis für Bissregistrierung",
			"preis": 31.68
		},
		{
			"nr": "1003",
			"text": "Basis für Stützstiftregistrat",
			"preis": 31.68
		},
		{
			"nr": "1005",
			"text": "Funktionslöffel aus Kunststoff",
			"preis": 31.68
		},
		{
			"nr": "1006",
			"text": "Individueller Löffel aus Kunststoff",
			"preis": 31.68
		},
		{
			"nr": "1007",
			"text": "Basis für Aufstellung",
			"preis": 31.68
		},
		{
			"nr": "1019",
			"text": "Basis für neue Abdrucknahme vorbereiten",
			"preis": 12
		},
		{
			"nr": "1108",
			"text": "Löffel für Implantatversorgung",
			"preis": 31.68
		},
		{
			"nr": "1111",
			"text": "Bisswall aus Wachs, auf Basis",
			"preis": 9.9
		},
		{
			"nr": "1113",
			"text": "Bisswall aus Kunststoff, auf Basis",
			"preis": 9.9
		},
		{
			"nr": "1115",
			"text": "Registrierplatte und -stift auf Basen",
			"preis": 39
		},
		{
			"nr": "1122",
			"text": "Wachsplatte für zentrische Bissnahme im Artikulator vorbereiten",
			"preis": 35
		},
		{
			"nr": "1201",
			"text": "Übertragungskappe aus Kunststoff",
			"preis": 12
		},
		{
			"nr": "1223",
			"text": "Basis für Bohrschablone bei Implantat",
			"preis": 31.68
		},
		{
			"nr": "1225",
			"text": "Implantat-Kontrollschablone",
			"preis": 25
		},
		{
			"nr": "1251",
			"text": "Vorwall",
			"preis": 8
		},
		{
			"nr": "1311",
			"text": "Röntgenkugel oder Bohrhülse positionieren",
			"preis": 7
		},
		{
			"nr": "1341",
			"text": "Walkhoffsche Tastkugel an Bißschablone",
			"preis": 12
		},
		{
			"nr": "1401",
			"text": "Provisorische Krone, Brückenglied, Stiftzahn, Onlay, Inlay aus Kunststoff",
			"preis": 35
		},
		{
			"nr": "1402",
			"text": "Provisorische Krone, Brückenglied, Stiftzahn, Onlay, Inlay aus Metall",
			"preis": 35
		},
		{
			"nr": "1403",
			"text": "Metallarmierung für provisorische Versorgung",
			"preis": 48
		},
		{
			"nr": "1404",
			"text": "Formteil für provisorische Versorgung",
			"preis": 35
		},
		{
			"nr": "1405",
			"text": "Formteil Kunststoff (Schleifkäppchen)",
			"preis": 19.2
		},
		{
			"nr": "1406",
			"text": "Reiseprothese aus PMMA (monochrome)",
			"preis": 190
		},
		{
			"nr": "1601",
			"text": "Allergietestplättchen",
			"preis": 11
		},
		{
			"nr": "1902",
			"text": "Aufwand bei Suprastruktur",
			"preis": 28.5
		},
		{
			"nr": "2001",
			"text": "Wurzelstift gegossen",
			"preis": 108.67
		},
		{
			"nr": "2011",
			"text": "Wurzelkappe",
			"preis": 108.67
		},
		{
			"nr": "2012",
			"text": "Wurzelstiftkappe",
			"preis": 108.67
		},
		{
			"nr": "2033",
			"text": "Individuelles Abutment",
			"preis": 95.31
		},
		{
			"nr": "2035",
			"text": "Gusstufenkrone oder Stegkappe auf Implantataufbau nach",
			"preis": 115.8
		},
		{
			"nr": "2101",
			"text": "Krone gegossen/gefräst",
			"preis": 115.8
		},
		{
			"nr": "2104",
			"text": "Dreiviertelkrone gegossen/gefräst",
			"preis": 115.8
		},
		{
			"nr": "2121",
			"text": "Krone gegossen / gefräst für Keramik/Kompositverblendung",
			"preis": 95
		},
		{
			"nr": "2126",
			"text": "Dreiviertelkrone gegossen/gefräst für Keramik/Kompositverblendung",
			"preis": 85.1
		},
		{
			"nr": "2154",
			"text": "Dreiviertelkrone gefräst",
			"preis": 80
		},
		{
			"nr": "2155",
			"text": "Anker gegossen/gefräst, für Klebebrücke",
			"preis": 114.38
		},
		{
			"nr": "2181",
			"text": "Stegkappe",
			"preis": 115.8
		},
		{
			"nr": "2251",
			"text": "Seitenzahnkrone aus Keramik gefräst (vollanatomisch)",
			"preis": 110
		},
		{
			"nr": "2252",
			"text": "Frontzahnkrone aus Keramik gefräst (vollanatomisch)",
			"preis": 135
		},
		{
			"nr": "2281",
			"text": "Krone aus Keramik gefräst",
			"preis": 110
		},
		{
			"nr": "2301",
			"text": "Inlay einflächig",
			"preis": 90
		},
		{
			"nr": "2302",
			"text": "Inlay zweiflächig",
			"preis": 90
		},
		{
			"nr": "2303",
			"text": "Inlay dreiflächig",
			"preis": 90
		},
		{
			"nr": "2304",
			"text": "Inlay mehrflächig",
			"preis": 115.8
		},
		{
			"nr": "2351",
			"text": "Brückenglied gefräßt Seitenzahn (vollanatomisch)",
			"preis": 110
		},
		{
			"nr": "2352",
			"text": "Brückenglied gefräßt Frontzahn (vollanatomisch)",
			"preis": 135
		},
		{
			"nr": "2361",
			"text": "Brückenglied gegossen/gefräst Metall",
			"preis": 98
		},
		{
			"nr": "2534",
			"text": "Teilkrone Keramik",
			"preis": 116.8
		},
		{
			"nr": "2551",
			"text": "Inlay aus Keramik, gefräst, einflächig",
			"preis": 78
		},
		{
			"nr": "2552",
			"text": "Inlay aus Keramik, gefräst, zweiflächig",
			"preis": 87
		},
		{
			"nr": "2553",
			"text": "Inlay aus Keramik, gefräst, dreiflächig",
			"preis": 98
		},
		{
			"nr": "2554",
			"text": "Inlay aus Keramik, gefräst, mehrflächig",
			"preis": 115.8
		},
		{
			"nr": "2601",
			"text": "Teil-Verblendungaus Komposite",
			"preis": 103.4
		},
		{
			"nr": "2602",
			"text": "mehrflachige Verblendungaus Komposite",
			"preis": 105.4
		},
		{
			"nr": "2603",
			"text": "Verblendschale aus Kunststoff",
			"preis": 72
		},
		{
			"nr": "2611",
			"text": "Teil-Verblendung aus Keramik",
			"preis": 132.2
		},
		{
			"nr": "2612",
			"text": "Mehrflächige Verblendung aus Keramik",
			"preis": 135.21
		},
		{
			"nr": "2653",
			"text": "Veneer aus Keramik",
			"preis": 135.21
		},
		{
			"nr": "2663",
			"text": "Verblendschale aus Komposit",
			"preis": 105.4
		},
		{
			"nr": "2671",
			"text": "Papille aus Komposite",
			"preis": 29
		},
		{
			"nr": "2672",
			"text": "Zahnfleisch aus Komposite",
			"preis": 29
		},
		{
			"nr": "2676",
			"text": "Papille aus Keramik",
			"preis": 52.5
		},
		{
			"nr": "2677",
			"text": "Zahnfleisch aus Keramik",
			"preis": 52.5
		},
		{
			"nr": "2678",
			"text": "Wurzelpontic aus Keramik",
			"preis": 52.5
		},
		{
			"nr": "2682",
			"text": "Papille aus Komposit",
			"preis": 29
		},
		{
			"nr": "2901",
			"text": "Stiftaufbau in vorhandene Krone einarbeiten",
			"preis": 35
		},
		{
			"nr": "2904",
			"text": "Angelieferte Modellation gießen/pressen",
			"preis": 29
		},
		{
			"nr": "2907",
			"text": "Brückenteilungsgeschiebe, individuell",
			"preis": 260
		},
		{
			"nr": "2909",
			"text": "Individuelles Charakterisieren eines Kunststoffzahnes",
			"preis": 20
		},
		{
			"nr": "2911",
			"text": "Krone/Brückenglied für Klammer vorbereiten",
			"preis": 21.13
		},
		{
			"nr": "2912",
			"text": "Krone/Brückenglied, Inlay passend für vorhandene Prothese arbeiten",
			"preis": 21.13
		},
		{
			"nr": "2913",
			"text": "Umgehungsbügel bei Diastema",
			"preis": 15
		},
		{
			"nr": "2918",
			"text": "Krone/Brückenglied für Klammer vorbereiten",
			"preis": 21.13
		},
		{
			"nr": "2922",
			"text": "Krone/Inlay/Brückenglied aufpassen",
			"preis": 7
		},
		{
			"nr": "2941",
			"text": "Individuell charakterisieren, Kunststoff",
			"preis": 15
		},
		{
			"nr": "2945",
			"text": "Individuell charakterisieren, Komposit",
			"preis": 15
		},
		{
			"nr": "2951",
			"text": "Individuell charakterisieren, Keramik",
			"preis": 21
		},
		{
			"nr": "2953",
			"text": "Fräsen je Glied bei Datenlieferung Material Katana YML",
			"preis": 39
		},
		{
			"nr": "2954",
			"text": "Fräsen je Glied bei Datenanlieferung - Material Katana MLo.ä.",
			"preis": 21.5
		},
		{
			"nr": "2955",
			"text": "Fräsen je Glied bei Datenanlieferung - Material NEM",
			"preis": 21.5
		},
		{
			"nr": "2956",
			"text": "Fräsen je Glied bei Datenanlieferung - Material PMMA",
			"preis": 21.5
		},
		{
			"nr": "2957",
			"text": "Fräsen einer Aufbisschiene bei Datenanlieferung (PMMA)",
			"preis": 53
		},
		{
			"nr": "2958",
			"text": "Fräsen einer Aufbisschiene bei Datenlieferung (Nylon)",
			"preis": 63
		},
		{
			"nr": "2959",
			"text": "Konst. und Fräsen einer Aufbisschiene bei Modellanlieferung (Nylon)",
			"preis": 73
		},
		{
			"nr": "2960",
			"text": "Konst. und Fräsen einer Aufbisschiene bei Modellanlieferung (PMMA)",
			"preis": 83
		},
		{
			"nr": "2961",
			"text": "Konst. und Fräsen KuB (NEM)",
			"preis": 32
		},
		{
			"nr": "2962",
			"text": "Konst. und Fräsen KuB aus (PMMA)",
			"preis": 29
		},
		{
			"nr": "2963",
			"text": "Krone/Inlay/Brückenglied aufpassen",
			"preis": 7
		},
		{
			"nr": "2964",
			"text": "Konst. und Fräsen KuB aus (ZrO2 Mono)",
			"preis": 29
		},
		{
			"nr": "2965",
			"text": "Konst. und Fräsen KuB aus (ZrO2 Multi)",
			"preis": 49
		},
		{
			"nr": "2966",
			"text": "Konst. und Fräsen KuB aus (Li2Silikat)",
			"preis": 69
		},
		{
			"nr": "2967",
			"text": "Fräsen je Glied bei Datenlieferung - Material (e.max)",
			"preis": 59
		},
		{
			"nr": "2972",
			"text": "Aufwandzu Suprastrukturbeiverschraubbarem Implantat",
			"preis": 28
		},
		{
			"nr": "2981",
			"text": "NEM Zuschlag",
			"preis": 20.46
		},
		{
			"nr": "2983",
			"text": "Titan verarbeiten bei festsitzendem Zahnersatz",
			"preis": 20.46
		},
		{
			"nr": "2984",
			"text": "Wax UP je Zahn",
			"preis": 13
		},
		{
			"nr": "3001",
			"text": "Teleskopkrone, primär/Sekundär",
			"preis": 210
		},
		{
			"nr": "3004",
			"text": "Teleskopkrone",
			"preis": 320
		},
		{
			"nr": "3021",
			"text": "Individuelles Geschiebe",
			"preis": 290
		},
		{
			"nr": "3023",
			"text": "Konfektioniertes Geschiebe, Gelenk, Anker einarbeiten",
			"preis": 135
		},
		{
			"nr": "3024",
			"text": "Lager für Raste",
			"preis": 35
		},
		{
			"nr": "3025",
			"text": "Umlaufraste für Schubverteilungsarm",
			"preis": 35
		},
		{
			"nr": "3027",
			"text": "Locator/Kugelanker in proth. einarbeiten",
			"preis": 130
		},
		{
			"nr": "3031",
			"text": "Individueller Steg, Grundeinheit",
			"preis": 95
		},
		{
			"nr": "3032",
			"text": "Individueller Steg, Längeneinheit",
			"preis": 15
		},
		{
			"nr": "3104",
			"text": "Stegfräsung",
			"preis": 110
		},
		{
			"nr": "3105",
			"text": "gefrästes Lager",
			"preis": 70
		},
		{
			"nr": "3215",
			"text": "Schubverteilungsarm",
			"preis": 59
		},
		{
			"nr": "3221",
			"text": "Individuelles Steggeschiebe",
			"preis": 260
		},
		{
			"nr": "3322",
			"text": "Steggeschiebe individuell, an/in Metallbasis",
			"preis": 54.96
		},
		{
			"nr": "3401",
			"text": "Drehriegel",
			"preis": 235
		},
		{
			"nr": "3403",
			"text": "Schwenkriegel",
			"preis": 235
		},
		{
			"nr": "3405",
			"text": "Schub- oder Steckriegel",
			"preis": 235
		},
		{
			"nr": "3521",
			"text": "Konfektionssteg Grundeinheit",
			"preis": 89
		},
		{
			"nr": "3523",
			"text": "Konfektionssteg Längeneinheit",
			"preis": 19
		},
		{
			"nr": "3621",
			"text": "Konfektions-Steglasche an/in Kunststoffbasis",
			"preis": 65
		},
		{
			"nr": "3623",
			"text": "Konfektions-Steglasche an/in Metallbasis",
			"preis": 75
		},
		{
			"nr": "3903",
			"text": "Friktionsstift einarbeiten",
			"preis": 32.5
		},
		{
			"nr": "3905",
			"text": "Verschraubung/Verbolzung",
			"preis": 102
		},
		{
			"nr": "3906",
			"text": "Verschraubung Implantat",
			"preis": 33
		},
		{
			"nr": "3931",
			"text": "Lösungsknopf für Verbindungselement",
			"preis": 31
		},
		{
			"nr": "4001",
			"text": "Metallbasis",
			"preis": 175
		},
		{
			"nr": "4007",
			"text": "Gitter total",
			"preis": 110
		},
		{
			"nr": "4008",
			"text": "Bügel",
			"preis": 110
		},
		{
			"nr": "4101",
			"text": "Einarmige Klammer gebogen",
			"preis": 12.8
		},
		{
			"nr": "4103",
			"text": "Kralle gebogen",
			"preis": 12.8
		},
		{
			"nr": "4106",
			"text": "Fortlaufende Klammer je Zahn gebogen",
			"preis": 12.8
		},
		{
			"nr": "4107",
			"text": "Gegenlager gebogen",
			"preis": 12.8
		},
		{
			"nr": "4111",
			"text": "Zweiarmige gefräste Klammer (Valplast)",
			"preis": 63
		},
		{
			"nr": "4112",
			"text": "Zweiarmige Klammer mit Auflage gebogen",
			"preis": 25.22
		},
		{
			"nr": "4119",
			"text": "Bonwill-Klammer gebogen",
			"preis": 25.22
		},
		{
			"nr": "4121",
			"text": "Ney Stiel gebogen",
			"preis": 15
		},
		{
			"nr": "4122",
			"text": "Auflage gegossen",
			"preis": 18.33
		},
		{
			"nr": "4201",
			"text": "gossene Retention",
			"preis": 69
		},
		{
			"nr": "4202",
			"text": "Gegossenes Basisteil",
			"preis": 96.54
		},
		{
			"nr": "4203",
			"text": "Retention an Sekundärteil",
			"preis": 49
		},
		{
			"nr": "4208",
			"text": "Retention gebogen",
			"preis": 50.44
		},
		{
			"nr": "4401",
			"text": "Einarmige Klammer gegossen",
			"preis": 18.33
		},
		{
			"nr": "4411",
			"text": "Zweiarmige Klammer gegossen",
			"preis": 21
		},
		{
			"nr": "4412",
			"text": "Zweiarmige Klammer mit Auflage gegossen",
			"preis": 30.97
		},
		{
			"nr": "4413",
			"text": "Bonwillkammer gegossen",
			"preis": 76.32
		},
		{
			"nr": "4421",
			"text": "Bearbeiten eines Implantataufbaus",
			"preis": 41
		},
		{
			"nr": "4431",
			"text": "Federarm inklusive Federarmlager",
			"preis": 17.9
		},
		{
			"nr": "4902",
			"text": "Rückenschutzplatte",
			"preis": 55.24
		},
		{
			"nr": "4903",
			"text": "Ruckenschutzplatte",
			"preis": 55.24
		},
		{
			"nr": "4905",
			"text": "Metallzahn",
			"preis": 55.24
		},
		{
			"nr": "4907",
			"text": "Metallfläche als Tuberabdeckung",
			"preis": 24
		},
		{
			"nr": "4941",
			"text": "Lösungsknopf für Friktionsprothese",
			"preis": 13
		},
		{
			"nr": "4951",
			"text": "Klammer einzeln gegossen",
			"preis": 27.2
		},
		{
			"nr": "5211",
			"text": "Lötvergoldung",
			"preis": 30
		},
		{
			"nr": "5307",
			"text": "Konditionieren je Zahn / Flügel",
			"preis": 20.9
		},
		{
			"nr": "6001",
			"text": "Aufstellen Grundeinheit",
			"preis": 41.6
		},
		{
			"nr": "6002",
			"text": "Aufstellen je Zahneinheit auf Wachs oder Kunststoffbasis",
			"preis": 2.69
		},
		{
			"nr": "6003",
			"text": "Aufstellen je Zahneinheit auf Metallbasis",
			"preis": 3.26
		},
		{
			"nr": "6021",
			"text": "Übertragen einer Wachsaufstellung auf Metallbasis",
			"preis": 2.22
		},
		{
			"nr": "6121",
			"text": "Zuschlag für Aufstellung bei Anwesenheit des Patienten",
			"preis": 60.5
		},
		{
			"nr": "6301",
			"text": "Grundeinheit Fertigstellung mit Kunststoffbasis",
			"preis": 69.84
		},
		{
			"nr": "6302",
			"text": "Fertigstellen mit Kunststoffbasis, je Zahneinheit",
			"preis": 4.86
		},
		{
			"nr": "6311",
			"text": "Grundeinheit Fertigstellung auf Metallbasis",
			"preis": 69.84
		},
		{
			"nr": "6312",
			"text": "Fertigstellen auf Metallbasis, je Zahneinheit",
			"preis": 4.86
		},
		{
			"nr": "6401",
			"text": "Transparente Gaumenplatte",
			"preis": 52.54
		},
		{
			"nr": "6405",
			"text": "Verarbeitung Weichkunststoff",
			"preis": 75.72
		},
		{
			"nr": "6412",
			"text": "Sonderkunststoff verarbeiten",
			"preis": 75.72
		},
		{
			"nr": "6414",
			"text": "Unterfütterbarer Abschlussrand",
			"preis": 27.62
		},
		{
			"nr": "6431",
			"text": "Befestigung eines Zahnes mit zahnfarbenem Kunststoff, Pontic",
			"preis": 12.5
		},
		{
			"nr": "6432",
			"text": "Herstellen eines Zahnes aus zahnfarbenem Kunststoff",
			"preis": 21.5
		},
		{
			"nr": "6433",
			"text": "Kauflacheauszahnfarbenem Kunststoff",
			"preis": 12.5
		},
		{
			"nr": "6451",
			"text": "Zahnfleischklammer",
			"preis": 23
		},
		{
			"nr": "6452",
			"text": "Pelottenklammer",
			"preis": 23
		},
		{
			"nr": "6501",
			"text": "Netz einarbeiten",
			"preis": 90
		},
		{
			"nr": "6502",
			"text": "Gußgitter einarbeiten",
			"preis": 90
		},
		{
			"nr": "6503",
			"text": "Konfektioniertes Metallgitter anpassen und einarbeiten",
			"preis": 70
		},
		{
			"nr": "6504",
			"text": "Draht einarbeiten",
			"preis": 36.54
		},
		{
			"nr": "6505",
			"text": "Bügel einarbeiten",
			"preis": 70
		},
		{
			"nr": "6506",
			"text": "Individuelle Beschwerungseinlage einarbeiten",
			"preis": 70
		},
		{
			"nr": "6509",
			"text": "Retention für Einzelzahn einarbeiten",
			"preis": 26.39
		},
		{
			"nr": "6521",
			"text": "Metallfacette einarbeiten",
			"preis": 36.54
		},
		{
			"nr": "6905",
			"text": "Primärteleskop aus Keramik Zuschlag je Teleskop",
			"preis": 35.99
		},
		{
			"nr": "6906",
			"text": "Individueller Implantataufbau Keramik",
			"preis": 70.91
		},
		{
			"nr": "6907",
			"text": "Veneer/Inlay aus Keramik",
			"preis": 115
		},
		{
			"nr": "6908",
			"text": "Provisorische Krone/Brücke je Glied (PMMA)",
			"preis": 33
		},
		{
			"nr": "6912",
			"text": "Versand UPS Express",
			"preis": 14
		},
		{
			"nr": "7001",
			"text": "Basis für Einzelkiefergerät",
			"preis": 64.94
		},
		{
			"nr": "7002",
			"text": "Basis für bimaxiläres Gerät",
			"preis": 129
		},
		{
			"nr": "7090",
			"text": "BetterSmile-Schiene Planungspauschale",
			"preis": 90
		},
		{
			"nr": "7091",
			"text": "BetterSmile-Modell und Regulierung-Schiene (Paar)",
			"preis": 75
		},
		{
			"nr": "7104",
			"text": "Dreiecksklammer",
			"preis": 12.45
		},
		{
			"nr": "7105",
			"text": "Pfeilklammer",
			"preis": 11.6
		},
		{
			"nr": "7106",
			"text": "Adams-Klammer",
			"preis": 16.17
		},
		{
			"nr": "7122",
			"text": "Auflage",
			"preis": 12.45
		},
		{
			"nr": "7201",
			"text": "Frontaler oder lateraler Aufbiß, hart",
			"preis": 15.67
		},
		{
			"nr": "7202",
			"text": "Frontaler oder lateraler Aufbiß, weich",
			"preis": 15.67
		},
		{
			"nr": "7301",
			"text": "Labialbogen",
			"preis": 27.47
		},
		{
			"nr": "7501",
			"text": "Trennen einer Basis und Funktionsfähigmachen der Schraube",
			"preis": 12
		},
		{
			"nr": "7503",
			"text": "Trennen einer Basis ohne Schraube",
			"preis": 8
		},
		{
			"nr": "7504",
			"text": "Funktionsfähigmachen einer Schraube ohne Trennen der Basis",
			"preis": 8
		},
		{
			"nr": "7601",
			"text": "Aufbisschiene adjustiert",
			"preis": 110.7
		},
		{
			"nr": "7602",
			"text": "Aufbisschiene nicht adjustiert",
			"preis": 80.19
		},
		{
			"nr": "7606",
			"text": "Bleaching Schiene",
			"preis": 52.95
		},
		{
			"nr": "7607",
			"text": "Fluoridierungsschiene",
			"preis": 59.69
		},
		{
			"nr": "7621",
			"text": "Aufbissschiene adjustiert",
			"preis": 110.7
		},
		{
			"nr": "7801",
			"text": "Sportschutz aus Weichkunststoff",
			"preis": 170
		},
		{
			"nr": "8002",
			"text": "Basis unterfüttern",
			"preis": 79.14
		},
		{
			"nr": "8003",
			"text": "Basis erneuern",
			"preis": 79.14
		},
		{
			"nr": "8006",
			"text": "Einarbeiten einer Modellgussbasis in vorhandene Kunststoffprothese",
			"preis": 70
		},
		{
			"nr": "8011",
			"text": "Instandsetzen einer Prothese, Kunststoffbasis oder KFO/FKO Gerät, Grundeinheit",
			"preis": 29.14
		},
		{
			"nr": "8021",
			"text": "Leistungseinheit, Sprung aus Kunststoff",
			"preis": 12.55
		},
		{
			"nr": "8022",
			"text": "Leistungseinheit, Bruch aus Kunststoff",
			"preis": 12.55
		},
		{
			"nr": "8023",
			"text": "Leistungseinheit, Wiederbefestigung Zahn",
			"preis": 12.55
		},
		{
			"nr": "8024",
			"text": "Leistungseinheit, Erneuerung Zahn",
			"preis": 12.55
		},
		{
			"nr": "8025",
			"text": "Leistungseinheit, Klammer einarbeiten",
			"preis": 12.55
		},
		{
			"nr": "8027",
			"text": "Leistungseinheit, Basisteil aus Kunststoff",
			"preis": 12.55
		},
		{
			"nr": "8028",
			"text": "Leistungseinheit, Sprung aus Metall",
			"preis": 12.55
		},
		{
			"nr": "8029",
			"text": "Leistungseinheit, Bruch aus Metall",
			"preis": 12.55
		},
		{
			"nr": "8030",
			"text": "Leistungseinheit, Kunststoffsattel lösen und wiederbefestigen",
			"preis": 12.55
		},
		{
			"nr": "8034",
			"text": "Leistungseinheit, Sekundärteil",
			"preis": 65.67
		},
		{
			"nr": "8036",
			"text": "Leistungseinheit Metallverbindung/Wiederherstellung",
			"preis": 27.38
		},
		{
			"nr": "8039",
			"text": "Prothesensattel kürzen, ausschleifen und polieren",
			"preis": 20.15
		},
		{
			"nr": "8111",
			"text": "Auswechseln von Konfektionsteil, einfach",
			"preis": 18.39
		},
		{
			"nr": "8112",
			"text": "Auswechseln von Konfektionsteil, kompliziert",
			"preis": 21
		},
		{
			"nr": "8123",
			"text": "Prothese/ABS/KFO-Gerät säubern und polieren",
			"preis": 35
		},
		{
			"nr": "8201",
			"text": "Kronen- oder Brückenglied Reparatur, je Glied",
			"preis": 49.8
		},
		{
			"nr": "8211",
			"text": "Leistungseinheit, Instandsetzen individueller Riegel",
			"preis": 25
		},
		{
			"nr": "8212",
			"text": "Leistungseinheit, Aktivieren Teleskopkrone oder Steggeschiebe",
			"preis": 25
		},
		{
			"nr": "8999",
			"text": "Rapid Prototyping Druck Pro Gramm inkl. Stützmaterial",
			"preis": 1.9
		},
		{
			"nr": "9029",
			"text": "Gerustaus Zikon monolitisch",
			"preis": 29
		},
		{
			"nr": "9031",
			"text": "Gerust vollanatomisch(glasiert)",
			"preis": 75
		},
		{
			"nr": "9034",
			"text": "Gerust NEM",
			"preis": 32
		},
		{
			"nr": "9581",
			"text": "Einarbeiten Sekundärteil",
			"preis": 65.67
		},
		{
			"nr": "9634",
			"text": "Fräsen je Einheit ohne Material",
			"preis": 10
		}
	]
};
//#endregion
//#region ../HKP/src/engine/beb-standard.ts
var r$1 = (nr, text, preis) => ({
	nr,
	text,
	preis,
	richtpreis: true
});
/**
* Positionen, die jede BEB-Liste jedes Mandanten enthält. Fehlt eine Nummer, wird sie mit Richtpreis
* (netto) ergänzt; vorhandene Nummern behalten Text und Preis der Liste.
*/
var BEB_STANDARD$1 = [
	r$1("0007", "Oralscan aufbereiten", 14),
	r$1("0009", "Scan Spezialmodell, Kunststoff gedruckt je Kiefer", 23),
	r$1("0013", "Präp freilegen Oralscan", 6.5),
	r$1("0017", "Stumpf Digitaldruck", 9.5),
	r$1("0032", "Sintern", 12),
	r$1("0710", "Eiltermin Zuschlag", 1),
	r$1("0723", "Zahnfarbenbestimmung I", 30),
	r$1("0724", "Zahnfarbenbestimmung II", 45),
	r$1("0901", "CAD: Anlage Auftragsdaten", 9.5),
	r$1("0902", "CAD: optisch digitale Registrierung", 14.5),
	r$1("0903", "CAD: Modellsegmentierung", 9.5),
	r$1("0904", "CAD: Segment / Biss digitalisieren, je Segment/Biss", 6.5),
	r$1("0905", "CAD: Bearbeitung Präpgrenze entsprechend dem Scan", 6.5),
	r$1("0906", "CAD: Glanz- und Kristallisationsbrand", 14),
	r$1("0907", "CAD: Einzelkrone konstruieren", 28),
	r$1("0908", "CAD: Brückenglied konstruieren", 24),
	r$1("0909", "CAD: Kaufläche konstruieren", 18),
	r$1("0910", "CAD: Verbundkonstruktion / Verbinder", 9.5),
	r$1("0911", "CAD: CAM Element nacharbeiten", 12),
	r$1("1401", "Provisorische Krone, Brückenglied, PMMA", 35),
	r$1("2281", "Krone aus Keramik gefräst (Anatomisch Vollzirkon)", 110),
	r$1("2361", "Brückenglied aus Keramik (Anatomisches Vollzirkon)", 110),
	r$1("2362", "Brückenglied gegossen/gefräst Metall", 98),
	r$1("2556", "Pro-Inlay, einflächig", 85),
	r$1("2557", "Pro-Inlay, zweiflächig", 95),
	r$1("2558", "Pro-Inlay, dreiflächig", 108),
	r$1("2559", "Pro-Inlay, mehrflächig; Onlay", 125),
	r$1("3303", "Sekundär Teleskop in Metallbasis einarbeiten", 45),
	r$1("3541", "Konfektionsriegel primär", 60),
	r$1("3641", "Konfektionsriegel sekundär", 60)
];
/** Nummern, die in älteren Listen eine andere Leistung tragen: die alte Leistung zieht auf `neu` um */
var UMZUG$1 = [{
	nr: "0007",
	alt: /kontrollmodell/i,
	neu: "0008"
}, {
	nr: "2361",
	alt: /metall/i,
	neu: "2362"
}];
var norm$2 = (nr) => nr.trim().padStart(4, "0");
/** Ergänzt eine BEB-Liste um die fehlenden Standardpositionen; ohne Änderung kommt dieselbe Liste zurück. */
function bebErgaenzen$1(liste) {
	const eintraege = [...liste.eintraege];
	let geaendert = false;
	for (const u of UMZUG$1) {
		const i = eintraege.findIndex((e) => norm$2(e.nr) === u.nr);
		if (i < 0 || !u.alt.test(eintraege[i].text)) continue;
		const [alt] = eintraege.splice(i, 1);
		if (!eintraege.some((e) => norm$2(e.nr) === u.neu)) eintraege.push({
			...alt,
			nr: u.neu
		});
		geaendert = true;
	}
	const fehlend = BEB_STANDARD$1.filter((s) => !eintraege.some((e) => norm$2(e.nr) === s.nr));
	if (!fehlend.length && !geaendert) return liste;
	return {
		...liste,
		eintraege: [...eintraege, ...fehlend].sort((a, b) => norm$2(a.nr).localeCompare(norm$2(b.nr)))
	};
}
//#endregion
//#region ../HKP/src/engine/zuordnung.ts
/**
* Zuordnung der Praxis- bzw. Fremdlabor-Positionen zu den Leistungsschritten, die PlanR plant.
* PlanR plant mit den Nummern der BEB-Standardliste (BEB-ITZ 2024 + Standardpositionen + digitale Schritte).
* Praxislisten stammen aus anderen BEB-Ausgaben (BEB 97, BEB Zahntechnik, VDZI) oder haben eigene Nummern –
* gleiche Nummer heißt dort nicht gleiche Leistung (z. B. BEB 97 2955 „Glasieren“, BEB-ITZ 2955 „Fräsen je Glied“).
* Deshalb wird jede Position über ihren Text einem Schritt zugeordnet; Varianten (gegossen/gefräst) gelten nur
* für den passenden Ablauf (Abdruck/Intraoralscan). Material ohne BEB-Nummer bekommt eine Rolle (Prothesenzahn,
* Abformmaterial …), mit der die Planung es dort ansetzt, wo es anfällt. Von Hand festgelegte Zuordnungen bleiben.
*/
var STOPP$1 = /* @__PURE__ */ new Set([
	"aus",
	"auf",
	"fur",
	"fuer",
	"der",
	"die",
	"das",
	"des",
	"dem",
	"den",
	"und",
	"oder",
	"mit",
	"ohne",
	"von",
	"vom",
	"zum",
	"zur",
	"bei",
	"nach",
	"pro",
	"eines",
	"einer",
	"einem",
	"einen",
	"eine",
	"ein",
	"inkl",
	"incl",
	"zzgl",
	"als",
	"nur",
	"auch",
	"in",
	"an",
	"je",
	"voll"
]);
/** Begriffe, die auch in zusammengesetzten oder abgekürzten Wörtern stecken („Kompositverblendung“, „teilverbl.“) */
var BEGRIFFE$1 = [
	[/verblendschalen?|veneers?/, "veneer"],
	[/verblend(ungen|ung|eten|ete|et)?|verbl$/, "verblendung"],
	[/keramik(en)?/, "keramik"],
	[/komposit(en|e)?|polymer(en|e)?|polyme$/, "komposit"],
	[/kunststoff(en|e)?/, "kunststoff"],
	[/zirkon(dioxid|oxid)?|lithiumdisilikat/, "keramik"],
	[/monolithisch(en|er|es|e)?|(voll)?anatomisch(en|er|es|e)?/, "vollanatomisch"],
	[/gefrae?s+t(en|er|es|e)?/, "gefraest"],
	[/^g?egossen(en|er|es|e)?|^gossen(en|er|es|e)?|^guss(?!s)/, "gegossen"]
];
var klein$1 = (s) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
/** Kleinbuchstaben ohne Umlaute, Wörter ohne Füllwörter; Komposita mit einem Begriff werden zerlegt */
function woerter$1(s) {
	const roh = klein$1(s).split(/[^a-z0-9]+/).filter((w) => (w.length >= 3 || w === "nem") && !STOPP$1.has(w) && !/^\d+$/.test(w));
	const aus = [];
	for (const w of roh) {
		let teile = [w];
		for (const [re, begriff] of BEGRIFFE$1) teile = teile.flatMap((t) => {
			const m = re.exec(t);
			if (!m) return [t];
			aus.push(begriff);
			return [t.slice(0, m.index), t.slice(m.index + m[0].length)];
		});
		if (teile.length === 1 && teile[0] === w) aus.push(w);
		else aus.push(...teile.filter((t) => t.length >= 4 && !STOPP$1.has(t)));
	}
	return [...new Set(aus)];
}
var VOKABULAR$1 = (() => {
	const basis = bebErgaenzen$1({ eintraege: beb_itz_2024_default$1.eintraege }).eintraege;
	const alle = /* @__PURE__ */ new Map();
	const dazu = (nr, text) => {
		const t = alle.get(nr) ?? [];
		if (!t.includes(text)) t.push(text);
		alle.set(nr, t);
	};
	for (const e of basis) dazu(bebNorm$1(e.nr), e.text);
	for (const e of BEB_STANDARD$1) dazu(bebNorm$1(e.nr), e.text);
	for (const d of DIGITAL_KATALOG$1) dazu(d.nr, d.text);
	return [...alle].map(([nr, t]) => ({
		nr,
		text: t[0],
		texte: t.map(woerter$1)
	}));
})();
new Map(VOKABULAR$1.map((e) => [e.nr, e]));
(() => {
	const df = /* @__PURE__ */ new Map();
	for (const e of VOKABULAR$1) for (const w of new Set(e.texte.flat())) df.set(w, (df.get(w) ?? 0) + 1);
	return df;
})();
//#endregion
//#region ../HKP/src/engine/berechnung.ts
/** Herstellendes Labor einer Position; Praxismaterial (MAT ohne Labor) liefert undefined. */
function laborVon(p, plan) {
	if (p.ebene === "BEL" || p.ebene === "BEB") return p.labor ?? (plan.einstellungen.labor === "praxis" ? "eigen" : "fremd");
	if (p.ebene === "MAT") return p.labor;
}
//#endregion
//#region ../HKP/src/engine/aufwertung.ts
function regelUebernehmen(p, regel, zaehne = p.zaehne, laborFuer = () => void 0) {
	const schluessel = (x) => `${x.ebene}|${x.nr}|${x.zahn}`;
	const bisher = new Map(p.positionen.filter((x) => x.labor).map((x) => [schluessel(x), x.labor]));
	const begruendung = new Map(p.positionen.filter((x) => x.auto && x.faktorBegruendung).map((x) => [schluessel(x), x.faktorBegruendung]));
	const aus = new Set(p.ausgeschlossen ?? []);
	const neu = regel.positionen.filter((x) => !aus.has(schluessel(x))).map((x) => {
		const labor = bisher.get(schluessel(x)) ?? laborFuer(x);
		const b = begruendung.get(schluessel(x));
		return {
			...x,
			...x.ebene === "GOZ" ? { faktor: p.einstellungen.gozFaktor } : {},
			...b ? { faktorBegruendung: b } : {},
			...labor && (x.ebene === "BEL" || x.ebene === "BEB") ? { labor } : {}
		};
	}).filter((x) => !(p.fremdlabor.import && (x.ebene === "BEL" || x.ebene === "BEB" || x.ebene === "MAT") && laborVon(x, p) === "fremd"));
	return {
		...p,
		zaehne: Object.fromEntries(Object.entries(zaehne).map(([z, v]) => [z, {
			...v,
			R: regel.R[z] ?? ""
		}])),
		befunde: [...regel.befunde, ...p.befunde.filter((b) => !b.auto)],
		positionen: [...neu, ...p.positionen.filter((x) => !x.auto)]
	};
}
/** Stufen des Eigenlabor-Reglers „Kasse → Privat“ */
var PRIVAT_STUFEN = [
	{
		titel: "Kasse",
		text: "Regelversorgung, Abrechnung nach BEL II"
	},
	{
		titel: "Teilverblendung",
		text: "Keramik-Teilverblendung auch außerhalb des Verblendbereichs (KV, BV, PKV, SKV, SBV)"
	},
	{
		titel: "Vollkeramik",
		text: "Vollkeramik, keramisch geschichtet (KM, BM, PKM, TM, SKM, SBM) + Keramikstufe"
	},
	{
		titel: "Ästhetik",
		text: "+ Charakterisierung, Papillen, individuelles Abutment, Sägemodell, Fräsmodell, Aufstellung am Patienten, Farbbestimmung, Gesichtsbogen"
	},
	{
		titel: "Premium",
		text: "+ Wax-up/Mock-up, Wurzelpontic, Keramik-Aufbau/-Primärteleskop, Zahnfleischmaske, Sonderkunststoff, Farbbestimmung in der Praxis, Fotodokumentation"
	}
];
var PRIVAT_STUFE_MAX = PRIVAT_STUFEN.length - 1;
var STUFE_1 = {
	K: "KV",
	KH: "KVH",
	B: "BV",
	PK: "PKV",
	SK: "SKV",
	SB: "SBV",
	ST: "STV"
};
var STUFE_2 = {
	K: "KM",
	KV: "KM",
	KH: "KMH",
	KVH: "KMH",
	B: "BM",
	BV: "BM",
	PK: "PKM",
	PKV: "PKM",
	T: "TM",
	TV: "TM",
	SK: "SKM",
	SKV: "SKM",
	SB: "SBM",
	SBV: "SBM",
	ST: "STM",
	STV: "STM"
};
var PROTHESE = /^S?EO?$/;
function zielTp(r, stufe) {
	const tp = stufe >= 2 ? STUFE_2[r] : stufe >= 1 ? STUFE_1[r] : void 0;
	return tp && tp !== r ? tp : void 0;
}
var zahnListe = (zahn) => zahn.split(/[,\s]+/).filter(Boolean);
var freiOderEigen = (plan, z) => !plan.zaehne[z].TP || plan.zaehne[z].TP === (plan.einstellungen.eigenPrivatTp ?? {})[z];
function eigeneLaborGebiete(plan) {
	return new Set(plan.positionen.filter((x) => (x.ebene === "BEL" || x.ebene === "BEB") && laborVon(x, plan) === "eigen").flatMap((x) => zahnListe(x.zahn)));
}
/** Zähne mit festsitzender Regelversorgung aus dem Eigenlabor, die sich privat aufwerten lassen. */
function privatKandidaten(plan) {
	const eigen = eigeneLaborGebiete(plan);
	return Object.entries(plan.zaehne).filter(([z, v]) => eigen.has(z) && STUFE_2[v.R] && freiOderEigen(plan, z)).map(([z]) => z).sort();
}
/**
* Ersetzte Zähne der Regelprothese je Kiefer, wenn sie aus dem Eigenlabor kommt. Die Prothese muss
* noch geplant sein (BEMA 96/97): ersetzen Implantate oder Brücken einen Teil der E-Zähne,
* gelten nur die in Zeile TP mit E markierten Zähne.
*/
function privatProthesen(plan) {
	const out = {
		OK: [],
		UK: []
	};
	for (const k of ["OK", "UK"]) {
		const eigen = plan.positionen.some((x) => (x.ebene === "BEL" || x.ebene === "BEB") && x.zahn === k && laborVon(x, plan) === "eigen");
		const regelProthese = plan.positionen.some((x) => x.ebene === "BEMA" && x.zahn === k && /^9[67][abc]$/.test(x.nr));
		if (!eigen || !regelProthese) continue;
		const zaehne = Object.entries(plan.zaehne).filter(([z, v]) => kieferVon$1(z) === k && PROTHESE.test(v.R));
		const tp = (v) => v.TP.trim().toUpperCase();
		const teilweise = zaehne.some(([, v]) => tp(v) && !PROTHESE.test(tp(v)));
		out[k] = zaehne.filter(([, v]) => teilweise ? PROTHESE.test(tp(v)) : !tp(v) || tp(v) === v.R).map(([z]) => z).sort();
	}
	return out;
}
function zahnInfo(zahn, kuerzel) {
	const art = PROTHESE.test(kuerzel) ? "prothese" : /^(S?B|AB)/.test(kuerzel) ? "glied" : /^S?T/.test(kuerzel) ? "teleskop" : "krone";
	return {
		zahn,
		kuerzel,
		art,
		implantat: kuerzel.startsWith("S"),
		keramik: art !== "prothese" && /[VM]/.test(kuerzel),
		front: istFrontzahn$1(zahn)
	};
}
var festsitzend = (i) => i.art !== "prothese";
var keramischFest = (i) => i.keramik;
/**
* Privatleistungen, die zur jeweiligen Ausführung passen. Reihenfolge = Anzeige.
* Alle Nummern aus der BEB-Liste; je Zahn, je Kiefer, je Kieferhälfte oder einmal je Fall.
*/
var PRIVAT_EXTRAS = [
	{
		nr: "0029",
		ab: 2,
		je: "zahn",
		wenn: (i) => i.art === "krone" && /M/.test(i.kuerzel)
	},
	{
		nr: "2951",
		ab: 3,
		je: "zahn",
		wenn: keramischFest
	},
	{
		nr: "2676",
		ab: 3,
		je: "zahn",
		wenn: (i) => i.art === "glied" && i.keramik
	},
	{
		nr: "2678",
		ab: 4,
		je: "zahn",
		wenn: (i) => i.art === "glied" && i.keramik && i.front
	},
	{
		nr: "2033",
		ab: 3,
		bis: 3,
		je: "zahn",
		wenn: (i) => i.implantat && i.art === "krone"
	},
	{
		nr: "6906",
		ab: 4,
		je: "zahn",
		wenn: (i) => i.implantat && i.art === "krone"
	},
	{
		nr: "6905",
		ab: 4,
		je: "zahn",
		wenn: (i) => i.art === "teleskop"
	},
	{
		nr: "0833",
		ab: 4,
		je: "zahn",
		wenn: (i) => i.art === "krone" || i.art === "glied"
	},
	{
		nr: "2909",
		ab: 3,
		je: "zahn",
		wenn: (i) => i.art === "prothese"
	},
	{
		nr: "0021",
		ab: 3,
		je: "kiefer",
		wenn: (i) => i.art === "krone" || i.art === "glied",
		ohneBel: "0051",
		ohneBeb: "0009"
	},
	{
		nr: "0019",
		ab: 3,
		je: "kiefer",
		wenn: (i) => i.art === "teleskop",
		ohneBel: "0055"
	},
	{
		nr: "0302",
		ab: 3,
		je: "kiefer",
		wenn: (i) => i.art === "teleskop"
	},
	{
		nr: "6121",
		ab: 3,
		je: "kiefer",
		wenn: (i) => i.art === "prothese"
	},
	{
		nr: "6412",
		ab: 4,
		je: "kiefer",
		wenn: (i) => i.art === "prothese"
	},
	{
		nr: "0731",
		ab: 4,
		je: "kiefer",
		wenn: (i) => i.art === "prothese"
	},
	{
		nr: "0223",
		ab: 3,
		je: "haelfte",
		wenn: (i) => i.implantat && festsitzend(i)
	},
	{
		nr: "0223",
		ab: 4,
		je: "haelfte",
		wenn: (i) => festsitzend(i)
	},
	{
		nr: "0723",
		ab: 3,
		bis: 3,
		je: "fall",
		wenn: (i) => i.keramik || i.art === "prothese"
	},
	{
		nr: "0724",
		ab: 4,
		je: "fall",
		wenn: (i) => i.keramik || i.art === "prothese"
	},
	{
		nr: "0404",
		ab: 3,
		je: "fall",
		wenn: () => true
	},
	{
		nr: "0522",
		ab: 4,
		je: "fall",
		wenn: (i) => i.front
	},
	{
		nr: "0706",
		ab: 4,
		je: "fall",
		wenn: () => true
	}
];
/** Abutment-Leistungen der Implantatprothetik (konfektioniert bearbeiten, individuell, Keramik) */
var ABUTMENT_BEB = [
	"4421",
	"2033",
	"6906"
];
function beb(nr, zahn) {
	return {
		id: `aufw-${nr}-${zahn || "fall"}`,
		ebene: "BEB",
		nr,
		zahn,
		anzahl: 1,
		auto: true,
		labor: "eigen"
	};
}
/** Zur Ausführung passende Privatleistungen des Eigenlabors */
function privatExtras(plan, infos, stufe) {
	const belVorhanden = new Set(plan.positionen.filter((x) => x.ebene === "BEL").map((x) => `${x.nr}|${x.zahn}`));
	const bebVorhanden = new Set(plan.positionen.filter((x) => x.ebene === "BEB" && !x.id.startsWith("aufw-")).map((x) => `${x.nr}|${x.zahn}`));
	const out = /* @__PURE__ */ new Map();
	for (const e of PRIVAT_EXTRAS) {
		if (stufe < e.ab || e.bis !== void 0 && stufe > e.bis) continue;
		for (const i of infos.filter(e.wenn)) {
			const gebiet = e.je === "zahn" ? i.zahn : e.je === "kiefer" ? kieferVon$1(i.zahn) : e.je === "haelfte" ? bereich$2(i.zahn) : "";
			if (e.ohneBel && belVorhanden.has(`${e.ohneBel}|${gebiet}`) || e.ohneBeb && bebVorhanden.has(`${e.ohneBeb}|${gebiet}`) || bebVorhanden.has(`${e.nr}|${gebiet}`)) continue;
			if (i.implantat && ABUTMENT_BEB.some((nr) => bebVorhanden.has(`${nr}|${gebiet}`)) && ABUTMENT_BEB.includes(e.nr)) continue;
			const p = beb(e.nr, gebiet);
			out.set(p.id, p);
		}
	}
	return [...out.values()];
}
/**
* Setzt die Stufe „Kasse → Privat“ des Eigenlabors. Das Zahnschema (B, R, TP) bleibt unverändert:
* Nur Zähne, die laut Planung im Eigenlabor als Kassenleistung (BEL) gefertigt werden, erhalten die
* höherwertige Ausführung der Stufe als Positionen – BEB statt BEL und, wie bei gleichartiger
* Versorgung vorgeschrieben, GOZ statt BEMA für die Krone/den Anker; der Festzuschuss bleibt.
* Dazu kommen die zur Ausführung passenden Privatleistungen, auch für Zähne mit eigener Planung.
*/
function privatStufeAnwenden(plan, stufe) {
	const alt = plan.einstellungen.eigenPrivatTp ?? {};
	const zaehne = Object.fromEntries(Object.entries(plan.zaehne).map(([z, v]) => [z, alt[z] && v.TP === alt[z] ? {
		...v,
		TP: ""
	} : v]));
	const p0 = {
		...plan,
		zaehne,
		einstellungen: {
			...plan.einstellungen,
			eigenPrivatTp: {}
		}
	};
	const rang = [
		"standard",
		"individuell",
		"keramik"
	];
	const abutment = rang[Math.max(rang.indexOf(plan.implantat.abutment), stufe >= 4 ? 2 : stufe >= 3 ? 1 : 0)];
	const rechnen = {
		...plan,
		implantat: {
			...plan.implantat,
			abutment
		}
	};
	const regel = regelversorgungErmitteln(zaehne, regelOptionen(plan));
	const kasse = regelUebernehmen(p0, therapieAnwenden(regel, zaehne, rechnen), zaehne);
	const kandidaten = privatKandidaten(kasse);
	const ziel = {};
	for (const z of kandidaten) {
		const t = zielTp(kasse.zaehne[z].R, stufe);
		if (t) ziel[z] = t;
	}
	const virtuell = Object.fromEntries(Object.entries(zaehne).map(([z, v]) => [z, ziel[z] ? {
		...v,
		TP: ziel[z]
	} : v]));
	const eigen = new Set(Object.keys(ziel));
	const basis = eigen.size ? regelUebernehmen(p0, therapieAnwenden(regel, virtuell, rechnen), zaehne, (x) => zahnListe(x.zahn).some((z) => eigen.has(z)) ? "eigen" : void 0) : kasse;
	const eigeneZaehne = eigeneLaborGebiete(basis);
	const geplant = Object.entries(basis.zaehne).filter(([z, v]) => v.TP.trim() && v.TP.trim().toUpperCase() !== v.R && eigeneZaehne.has(z) && !/^(S?EO?|SO|H)$/.test(v.TP.trim().toUpperCase())).map(([z, v]) => zahnInfo(z, v.TP.trim().toUpperCase()));
	const prothesen = privatProthesen(basis);
	const infos = [
		...kandidaten.map((z) => zahnInfo(z, ziel[z] ?? basis.zaehne[z].R)),
		...geplant,
		...[...prothesen.OK, ...prothesen.UK].map((z) => zahnInfo(z, basis.zaehne[z].R))
	];
	const aus = new Set(plan.einstellungen.eigenPrivatAus ?? []);
	const extras = privatExtras(basis, infos, stufe).filter((x) => !aus.has(x.id));
	const hinweise = [];
	const prothesenKiefer = ["OK", "UK"].filter((k) => prothesen[k].length);
	if (eigen.size || extras.length) {
		const teile = [...eigen.size ? [`Zahn ${[...eigen].sort().join(", ")} als ${[...new Set(Object.values(ziel))].join("/")} (BEB statt BEL, GOZ statt BEMA)`] : [], ...extras.length ? [`${extras.length} passende Privatleistungen (BEB ${[...new Set(extras.map((x) => x.nr))].join(", ")})`] : []];
		hinweise.push(`Eigenlabor privat (${PRIVAT_STUFEN[stufe].titel}): ${teile.join("; ")} – Zahnschema unverändert, gleichartige Versorgung, Festzuschuss unverändert; Patient vorher aufklären (Mehrkostenvereinbarung). Leistungen nur berechnen, wenn sie tatsächlich erbracht werden.`);
	} else if (stufe > 0 && !kandidaten.length && !geplant.length && !prothesenKiefer.length) hinweise.push("Eigenlabor privat: keine Eigenlabor-Versorgung, die sich aufwerten lässt (Krone, Brückenglied, Teilkrone, Teleskop, Implantatkrone, Prothese).");
	return {
		plan: {
			...basis,
			positionen: [...basis.positionen.filter((x) => !x.id.startsWith("aufw-")), ...extras],
			einstellungen: {
				...basis.einstellungen,
				eigenPrivatStufe: stufe,
				eigenPrivatTp: {}
			}
		},
		hinweise
	};
}
//#endregion
//#region ../HKP/src/engine/ausfuehrung.ts
var WERKSTOFF_MUSTER = [
	["hochgold", /hochgold|\bgold(?! ?reduz)|galvano/],
	["goldreduziert", /gold ?reduziert|reduzierte?[snm]? gold|edelmetallreduziert/],
	["nem", /\bn\.? ?e\.? ?m\b|nichtedel|kobalt|chrom|edelmetallfrei/],
	["zirkon", /zirkon|vollanatom|monolith|vollzirkon|\b(?:voll ?)?keramik(?! ?verblend)|\bvollkeramisch/],
	["presskeramik", /press ?keramik|e\.? ?max press|\bpress\b/],
	["lithiumdisilikat", /lithium|e\.? ?max(?! press)|cad ?block/]
];
var ABFORMUNG_MUSTER = [["scan", /scan|intraoral|gescannt|digital/], ["abdruck", /abdr(?:ü|u|ue)ck|konventionell|herk(?:ö|oe)mmlich|analog/]];
var ABFORM_ALLGEMEIN = /abform|l(?:ö|oe)ffel/;
var LABOR_MUSTER = [["praxis", /eigen ?labor|eigene[snm]? labor|praxis ?labor|haus ?labor|labor im haus|\bim haus\b|in ?house|unsere[mns]? labor|bei uns gefertigt/], ["gewerbe", /fremd ?labor|fremde[snm]? labor|gewerbliche[snm]? labor|gewerbe ?labor|externe[snm]? labor|ausw(?:ä|ae)rtige[snm]? labor|\bextern\b|au(?:ß|ss)er haus/]];
/** Erkennung gesprochener Systemnamen (auch typische Hörfehler) → ID aus IMPLANTATSYSTEME */
var SYSTEM_MUSTER = [
	["medentis-icx", /medentis|medendis|\bi ?c ?x\b/],
	["straumann-bl", /strau ?mann?/],
	["nobel-active", /nobel/],
	["astra-ev", /astra/],
	["ankylos", /ankylos|ankilos/],
	["xive", /\bxive\b|\bxi ve\b/],
	["camlog", /camlog|kamlog|conelog|konelog/],
	["zimmer-tsv", /biomet|zimmer biomet/],
	["biohorizons", /bio ?horizon/],
	["bego-semados", /\bbego\b|semados/],
	["bredent-copasky", /bredent|copa ?sky/],
	["champions-revolution", /champions?\b/],
	["mis-c1", /\bmis (?:c ?1|v ?3|implantat|system)/],
	["neoss-proactive", /neoss/],
	["osstem-tsiii", /osstem|ostem/],
	["megagen-anyridge", /mega ?gen|any ?ridge/],
	["thommen-element", /thommen|thomen/],
	["sic-invent", /sic ?(?:invent|ace|max)/],
	["dentaurum-tiologic", /dentaurum|tio ?logic/],
	["implantdirect-legacy", /implant ?direct/]
];
var STUFE_MUSTER = [
	[PRIVAT_STUFE_MAX, /premium|maximal teuer|m(?:ö|oe)glichst teuer|so teuer wie m(?:ö|oe)glich|h(?:ö|oe)chste[nr]? stufe|maximale[nr]? stufe|stufe maximal|alles privat|voll privat|komplett privat|stufe (?:vier|4)\b/],
	[3, /(?:ä|ae)sthetik|stufe (?:drei|3)\b/],
	[2, /stufe vollkeramik|vollkeramik ?stufe|stufe (?:zwei|2)\b/],
	[1, /stufe (?:eins|1)\b/],
	[0, /stufe kasse|kassenstufe|nur kasse|zur(?:ü|ue)ck auf kasse|ohne privat|keine privat|stufe (?:null|0)\b/]
];
/** Letzte nicht verneinte Nennung. „momentan teilverblendet … voll verblendet“ bleibt Vollverblendung. */
var VERBLENDUNG_MUSTER = [
	["voll", /voll\s*verblend|vollverblend|voll\s*verbelnd|vollverbelnd|mehrfl(?:ä|ae|a)chig\w* verblend|rundum verblend|ringsum verblend|komplett verblend/],
	["vestibulaer", /vestibul(?:ä|ae|a)?r/],
	["teil", /teil\s*verblend|teilverblend|ger(?:ü|ue)st\w*.{0,30}verblend|verblendger(?:ü|ue)st/],
	["keine", /unverblendet|ohne verblendung|nicht verblendet|vollmetall|nur metall|aus metall ohne/]
];
var VERNEINT_DAVOR = /(?:\bstatt|\banstatt|\banstelle|\bnicht|\bkein\w*|\bohne|\bweg von)\s+(?:(?:dem|der|den|das|des|mit|im|in|von|vom|einem|einer|einen|eine)\s+)?$/;
var VERNEINT_DANACH = /^\s+(?:bitte\s+|doch\s+|lieber\s+)?(?:nicht\b|war falsch|ist falsch|stimmt nicht)/;
/** „momentan teilverblendet“ beschreibt den Ist-Stand, nicht den Wunsch */
var IST_ZUSTAND = /(?:\bmomentan|\baktuell|\bderzeit|\bbisher|\bim moment|\bzurzeit|\bgegenw(?:ä|ae)rtig|\bjetzt noch)\s+(?:(?:die|der|das|den|dem|des|ein|eine|einer|einem)\s+)?$/;
/**
* Letzte nicht verneinte Nennung gewinnt („Zirkon statt NEM“, „NEM – nein, doch Zirkon“).
* Ein Treffer innerhalb eines längeren Treffers anderer Art zählt nicht („reduziertes Gold“).
*/
function letzteNennung(t, muster) {
	const treffer = [];
	for (const [wert, re] of muster) for (const m of t.matchAll(new RegExp(re.source, "g"))) {
		const von = m.index ?? 0;
		treffer.push({
			wert,
			von,
			bis: von + m[0].length
		});
	}
	return treffer.filter((x) => !treffer.some((y) => y.wert !== x.wert && y.von <= x.von && y.bis >= x.bis && y.bis - y.von > x.bis - x.von)).filter((x) => !VERNEINT_DAVOR.test(t.slice(Math.max(0, x.von - 30), x.von)) && !VERNEINT_DANACH.test(t.slice(x.bis, x.bis + 30)) && !IST_ZUSTAND.test(t.slice(Math.max(0, x.von - 40), x.von))).sort((a, b) => b.von - a.von)[0]?.wert;
}
/** Ausführung aus gesprochenem Text; nicht Genanntes bleibt weg */
function ausfuehrungIn(text) {
	const t = ` ${text.toLowerCase().replace(/[‐–—-]/g, " ").replace(/\s+/g, " ")} `;
	const a = {};
	const werkstoff = letzteNennung(t, WERKSTOFF_MUSTER);
	if (werkstoff) a.werkstoff = werkstoff;
	const abformung = letzteNennung(t, ABFORMUNG_MUSTER) ?? (ABFORM_ALLGEMEIN.test(t) ? "abdruck" : void 0);
	if (abformung) a.abformung = abformung;
	const labor = letzteNennung(t, LABOR_MUSTER);
	if (labor) a.labor = labor;
	const system = letzteNennung(t, SYSTEM_MUSTER);
	if (system) a.implantatSystem = system;
	const stufe = letzteNennung(t, STUFE_MUSTER);
	if (stufe !== void 0) a.privatStufe = stufe;
	const verblendung = letzteNennung(t, VERBLENDUNG_MUSTER);
	if (verblendung) a.verblendung = verblendung;
	return a;
}
var KERAMIK$1 = new Set(WERKSTOFFE_FUER$1.keramik);
/** Vollkeramik-Gerüst (nicht die metallische Vollverblendung TM/T2M/STM) */
var KERAMIK_GERUEST = /* @__PURE__ */ new Set([
	"KM",
	"KMH",
	"KMO",
	"BM",
	"PKM",
	"SKM",
	"SKMO",
	"SBM",
	"ABM"
]);
var VERBLEND_V = {
	K: "KV",
	KH: "KVH",
	B: "BV",
	PK: "PKV",
	SK: "SKV",
	SB: "SBV",
	ST: "STV",
	T: "TV",
	T2: "T2V",
	A: "ABV",
	KM: "KV",
	KMH: "KVH",
	BM: "BV",
	PKM: "PKV",
	SKM: "SKV",
	SBM: "SBV",
	STM: "STV",
	TM: "TV",
	T2M: "T2V",
	ABM: "ABV",
	KV: "KV",
	KVH: "KVH",
	BV: "BV",
	PKV: "PKV",
	SKV: "SKV",
	SBV: "SBV",
	STV: "STV",
	TV: "TV",
	T2V: "T2V",
	ABV: "ABV"
};
var VERBLEND_M = {
	K: "KM",
	KV: "KM",
	KM: "KM",
	KH: "KMH",
	KVH: "KMH",
	KMH: "KMH",
	B: "BM",
	BV: "BM",
	BM: "BM",
	PK: "PKM",
	PKV: "PKM",
	PKM: "PKM",
	SK: "SKM",
	SKV: "SKM",
	SKM: "SKM",
	SB: "SBM",
	SBV: "SBM",
	SBM: "SBM",
	ST: "STM",
	STV: "STM",
	STM: "STM",
	T: "TM",
	TV: "TM",
	TM: "TM",
	T2: "T2M",
	T2V: "T2M",
	T2M: "T2M",
	A: "ABM",
	ABV: "ABM",
	ABM: "ABM"
};
var VERBLEND_OHNE = {
	KV: "K",
	KM: "K",
	KVH: "KH",
	KMH: "KH",
	BV: "B",
	BM: "B",
	PKV: "PK",
	PKM: "PK",
	SKV: "SK",
	SKM: "SK",
	SBV: "SB",
	SBM: "SB",
	STV: "ST",
	STM: "ST",
	TV: "T",
	TM: "T",
	T2V: "T2",
	T2M: "T2",
	ABV: "A",
	ABM: "A"
};
function codeFuerVerblendung(code, zahn, art) {
	const c = code.trim().toUpperCase();
	if (!c) return void 0;
	if (art === "voll") return VERBLEND_M[c];
	if (art === "keine") return VERBLEND_OHNE[c] ?? (VERBLEND_V[c] || VERBLEND_M[c] ? c : void 0);
	if (art === "vestibulaer" && !imVerblendbereich(zahn)) return VERBLEND_OHNE[c] ?? (VERBLEND_V[c] ? c : void 0);
	return VERBLEND_V[c];
}
/** Therapiekürzel auf die gesprochene Verblendart. Vollkeramik (Zirkon und Co.) bleibt unangetastet. */
function zaehneFuerVerblendung(plan, art, werkstoff) {
	const keramikAuftrag = !!werkstoff && KERAMIK$1.has(werkstoff);
	return Object.fromEntries(Object.entries(plan.zaehne).map(([z, v]) => {
		const wirk = (v.TP.trim() || v.R.trim()).toUpperCase();
		const gewaehlt = plan.werkstoffe?.[z];
		if (gewaehlt && KERAMIK$1.has(gewaehlt) || keramikAuftrag && KERAMIK_GERUEST.has(wirk)) return [z, v];
		const neu = codeFuerVerblendung(wirk, z, art);
		if (!neu) return [z, v];
		if (neu === v.R.trim().toUpperCase()) return [z, v.TP ? {
			...v,
			TP: ""
		} : v];
		if (neu === v.TP.trim().toUpperCase()) return [z, v];
		return [z, {
			...v,
			TP: neu
		}];
	}));
}
//#endregion
//#region ../HKP/src/engine/vokabular.ts
var wort = (t) => ` ${t.toLowerCase().replace(/[‐–—]/g, "-").replace(/\s+/g, " ")} `;
function letzte(t, muster) {
	let bei = -1;
	let wert;
	for (const [v, re] of muster) for (const m of t.matchAll(new RegExp(re.source, "g"))) {
		const i = m.index ?? 0;
		if (i >= bei) {
			bei = i;
			wert = v;
		}
	}
	return wert;
}
/** All-on-4/6, Steg, Locator, Inlay, Teleskop, Brücke, Krone, Suprakonstruktion – das Speziellere gewinnt */
function prothetikIn(text) {
	const t = wort(text);
	const aus = {};
	const all = t.match(/\b(?:all[\s-]*on|allon|orlon|olon|ollon|alon)[\s-]*(4|vier|four|6|sechs|six)\b/);
	const sekundaer = /sekund(?:ä|ae)r/.test(t) && /teleskop|krone|teil/.test(t) && !/prim(?:ä|ae)r/.test(t);
	const teleskop = /teleskop|konus|doppelkrone|prim(?:ä|ae)r(?:krone|teleskop)/.test(t) || sekundaer;
	const locator = /druckknopf|locator|locater|kugel(?:kopf|anker)|novaloc|equator/.test(t) || /patri(?:ze|ce)|matri(?:ze|ce)/.test(t) && /implantat|prothese/.test(t);
	const steg = /steg|mesostruktur|hybridprothese/.test(t);
	const inlay = /inlay|onlay|einlagef/.test(t) && !/krone|teleskop|br(?:ü|ue)cke/.test(t);
	if (all) {
		aus.versorgung = "allon";
		aus.allon = /6|sechs|six/.test(all[1]) ? 6 : 4;
	} else if (steg) {
		aus.versorgung = "steg";
		aus.anker = "steg";
	} else if (locator) {
		aus.versorgung = "locator";
		aus.anker = /kugel/.test(t) && !/locator|druckknopf|novaloc|equator/.test(t) ? "kugel" : "locator";
	} else if (inlay) aus.versorgung = "inlay";
	else if (teleskop) {
		aus.versorgung = "teleskopprothese";
		aus.anker = "teleskop";
		aus.sekundaer = sekundaer;
	} else if (/br(?:ü|ue)cke/.test(t)) aus.versorgung = "bruecke";
	else if (/totalprothese|vollprothese|\btotale\b/.test(t)) aus.versorgung = "totalprothese";
	else if (/prothese/.test(t) && /implantat/.test(t)) {
		aus.versorgung = "locator";
		aus.anker = "locator";
	} else if (/implantat|suprakonstruktion/.test(t)) aus.versorgung = "implantatkronen";
	else if (/ger(?:ü|ue)st/.test(t) && /verblend/.test(t) || /teilkrone|dreiviertel|table[\s-]?top|okklusionsschale|kaufl(?:ä|ae)chenschale|veneer|verblendschale|galvano|krone/.test(t)) aus.versorgung = "kronen";
	if (/table[\s-]?top|okklusionsschale|kaufl(?:ä|ae)chenschale/.test(t)) aus.kronenart = "tabletop";
	else if (/teilkrone|dreiviertelkrone|3\/4/.test(t)) aus.kronenart = "teilkrone";
	else if (/veneer|verblendschale/.test(t)) aus.kronenart = "veneer";
	else if (/onlay/.test(t)) aus.kronenart = "onlay";
	else if (/inlay|einlagef/.test(t)) aus.kronenart = "inlay";
	else if (/galvano/.test(t)) aus.kronenart = "galvano";
	if (/vollanatom|monolith|vollzirkon/.test(t)) aus.form = "vollanatomisch";
	aus.retention = letzte(t, [["verschraubt", /verschraub|schraubenkrone|schraubkrone/], ["zementiert", /zementier/]]);
	aus.abutment = letzte(t, [
		["keramik", /keramik\s*abutment|zirkon\s*abutment|abutment\w* aus (?:zirkon|keramik)|individuelle[snm]? keramik/],
		["individuell", /individuell\w* abutment|custom[\s-]?abutment|cad\s?cam\s*abutment|hybrid\s*abutment|ti[\s-]?base/],
		["standard", /konfektioniert\w* abutment|standard\s*abutment|titan\s*abutment|multi[\s-]?unit/]
	]);
	if (/multi[\s-]?unit/.test(t) && !aus.retention) aus.retention = "verschraubt";
	aus.loeffel = letzte(t, [["offen", /offene[mnrs]? (?:l(?:ö|oe)ffel|abform)/], ["geschlossen", /geschlossene[mnrs]? l(?:ö|oe)ffel/]]);
	const fl = letzte(t, [
		["4", /vier[\s-]*fl|4[\s-]*fl|mehr[\s-]*fl/],
		["3", /drei[\s-]*fl|3[\s-]*fl|\bmod\b|\bmol\b|\bdol\b/],
		["1", /ein[\s-]*fl|1[\s-]*fl/],
		["2", /zwei[\s-]*fl|2[\s-]*fl|\bmo\b|\bod\b|\bdo\b/]
	]);
	if (fl) {
		aus.flaechen = Number(fl);
		aus.flaechenGenannt = true;
	}
	aus.aufImplantat = /implantat|suprakonstruktion|all[\s-]*on/.test(t) || aus.versorgung === "locator" || aus.versorgung === "steg" || aus.versorgung === "allon" || aus.versorgung === "implantatkronen";
	if (!aus.anker && !aus.allon && !aus.retention && !aus.abutment && !aus.kronenart && !aus.form && !aus.versorgung) return {};
	return aus;
}
/** Übliche Implantatsitze, wenn keine Zähne genannt sind (Maló). Distal davon keine Freiendglieder. */
var ALLON_SITZ = {
	4: {
		OK: [
			"15",
			"12",
			"22",
			"25"
		],
		UK: [
			"45",
			"42",
			"32",
			"35"
		]
	},
	6: {
		OK: [
			"16",
			"14",
			"12",
			"22",
			"24",
			"26"
		],
		UK: [
			"46",
			"44",
			"42",
			"32",
			"34",
			"36"
		]
	}
};
//#endregion
//#region ../HKP/src/engine/auftrag.ts
var ZAHL_WORT = {
	einser: "1",
	zweier: "2",
	dreier: "3",
	eckzahn: "3",
	eckzaehne: "3",
	eckzähne: "3",
	vierer: "4",
	fuenfer: "5",
	fünfer: "5",
	sechser: "6",
	siebener: "7",
	siebner: "7",
	achter: "8"
};
var QUADRANT = {
	OK: {
		rechts: "1",
		links: "2"
	},
	UK: {
		rechts: "4",
		links: "3"
	}
};
var REIHE = {
	OK: OBERKIEFER$1,
	UK: UNTERKIEFER$1
};
var FDI = /\b([1-4][1-8])\b/g;
/**
* Gesprochene Kiefer-Wörter vereinheitlichen: „Oberkieferprothese“ → „oberkiefer prothese“,
* STT-Hörfehler „Oberkäfer“, „Ober- und Unterkiefer“ → beide Kiefer ausgeschrieben.
*/
var kieferWorte = (t) => t.replace(/\bober-?\s+(und|oder|sowie)\s+unter/g, "oberkiefer $1 unter").replace(/\bunter-?\s+(und|oder|sowie)\s+ober/g, "unterkiefer $1 ober").replace(/\b(ober|unter)-?\s?k(?:ie|ä|ae|i|e)ff?er(s)?\b-?/g, " $1kiefer ").replace(/\b(ober|unter)k(?:ie|ä|ae|i|e)ff?er(?=[a-zäöüß])/g, " $1kiefer ");
/**
* Gesprochene Stellen (Live 15.10.2026): „die Zähne vier, fünf, sechs, sieben“ → „die vierer, fünfer, sechser und siebener“,
* „Zähne vier bis sieben“ ebenso; „Weisheitszähne“ → „achter“. Nur direkt nach „Zähne“ – „zwei Teleskopprothesen“ bleibt.
*/
var STELLE = {
	eins: 1,
	zwei: 2,
	drei: 3,
	vier: 4,
	fünf: 5,
	fuenf: 5,
	sechs: 6,
	sieben: 7,
	acht: 8
};
var STELLE_NAME = [
	"",
	"einser",
	"zweier",
	"dreier",
	"vierer",
	"fünfer",
	"sechser",
	"siebener",
	"achter"
];
var STELLE_WORT = "(?:eins|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht|[1-8])";
var STELLEN_LISTE = new RegExp(`\\bz(?:ä|ae)hne?\\s+(${STELLE_WORT}(?:\\s*(?:,|und|bis|-)\\s*${STELLE_WORT})*)\\b`, "g");
var stellenWorte = (t) => t.replace(/\bweisheitsz(?:ä|ae)hnen?\b(?!\s*\d)/g, "achter").replace(STELLEN_LISTE, (_, liste) => {
	const stellen = [];
	let bis = false;
	for (const w of liste.match(new RegExp(`${STELLE_WORT}|bis|-`, "g")) ?? []) {
		if (w === "bis" || w === "-") {
			bis = true;
			continue;
		}
		const n = STELLE[w] ?? Number(w);
		const von = stellen[stellen.length - 1];
		if (bis && von && n > von) for (let i = von + 1; i < n; i++) stellen.push(i);
		if (!stellen.includes(n)) stellen.push(n);
		bis = false;
	}
	const namen = stellen.map((n) => STELLE_NAME[n]);
	return namen.length > 1 ? `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}` : namen.join("");
});
var norm$1 = (t) => ` ${stellenWorte(kieferWorte(t.toLowerCase().replace(/[‐–—]/g, "-"))).replace(/\s+/g, " ")} `;
function kieferIn(t) {
	const ok = /\b(ok|o\.k\.|oberkiefer|oben)\b/.test(t);
	const uk = /\b(uk|u\.k\.|unterkiefer|unten)\b/.test(t);
	return ok && !uk ? "OK" : uk && !ok ? "UK" : void 0;
}
/** „Teleskopprothese im Ober- und Unterkiefer …“, „sowohl im Oberkiefer als auch im Unterkiefer“: eine Angabe für beide */
var KIEFER_GEMEINSAM = /\b(?:oberkiefer|ok)\s+(?:und|sowie|als auch)\s+(?:(?:im|in|den|dem)\s+)?(?:unterkiefer|uk)\b|\b(?:unterkiefer|uk)\s+(?:und|sowie|als auch)\s+(?:(?:im|in|den|dem)\s+)?(?:oberkiefer|ok)\b/;
/** Zähne von a bis b entlang der Zahnreihe (auch über die Mitte, z. B. 13 bis 23) */
function zahnSpanne(a, b) {
	if (kieferVon$1(a) !== kieferVon$1(b)) return [a, b];
	const reihe = REIHE[kieferVon$1(a)];
	const i = reihe.indexOf(a), j = reihe.indexOf(b);
	return reihe.slice(Math.min(i, j), Math.max(i, j) + 1);
}
/** Zahnangaben eines Satzteils: FDI-Nummern, Spannen („15 bis 18“), „OK-Vierer“, „Frontzähne“ */
function zaehneIn(teil, kiefer) {
	const t = norm$1(teil);
	const out = [];
	const dazu = (zs) => zs.forEach((z) => !out.includes(z) && out.push(z));
	const spannen = /\b([1-4][1-8])\s*(?:bis|-)\s*([1-4][1-8])\b/g;
	let rest = t;
	for (const m of t.matchAll(spannen)) {
		dazu(zahnSpanne(m[1], m[2]));
		rest = rest.replace(m[0], " ");
	}
	for (const m of rest.matchAll(FDI)) dazu([m[1]]);
	const k = kieferIn(t) ?? kiefer;
	const re = /\brechte?[nmrs]?\b/.test(t), li = /\blinke?[nmrs]?\b/.test(t);
	const seiten = re && !li ? ["rechts"] : li && !re ? ["links"] : ["rechts", "links"];
	for (const m of t.matchAll(/\b(\d)er(?:n|s)?\b|\b(einser|zweier|dreier|eckz(?:ah|äh|aeh)ne?|vierer|f(?:ü|ue)nfer|sechser|siebe?ner|achter)n?\b/g)) {
		const stelle = m[1] ?? ZAHL_WORT[m[2].replace(/n$/, "")] ?? (m[2].startsWith("eckz") ? "3" : void 0);
		if (!stelle || !k || stelle === "0" || stelle === "9") continue;
		dazu(seiten.map((s) => QUADRANT[k][s] + stelle));
	}
	if (k && /\bfront(?:z(?:ä|ae)hne?)?\b/.test(t)) dazu(zahnSpanne(k === "OK" ? "13" : "43", k === "OK" ? "23" : "33"));
	return out;
}
var STELLE_EINZEL = "[1-8]|eins|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht";
function stelleNummer(w) {
	if (/^[1-8]$/.test(w)) return w;
	const n = STELLE[w];
	return n ? String(n) : void 0;
}
/** Ohne genannten Kiefer alle vier Quadranten. „im Oberkiefer“ nur 1 und 2. */
function quadrantenAus(t, kiefer) {
	const okWort = /\b(ok|oberkiefer|oben)\b/.test(t);
	const ukWort = /\b(uk|unterkiefer|unten)\b/.test(t);
	const ok = kiefer === "OK" || okWort && !ukWort;
	const uk = kiefer === "UK" || ukWort && !okWort;
	if (ok && !uk) return ["1", "2"];
	if (uk && !ok) return ["4", "3"];
	return [
		"1",
		"2",
		"4",
		"3"
	];
}
/** „von 4 auf 6“, „von 3 auf 3“: Stellen im Quadranten, nicht die FDI-Nummer 46. */
function positionsSpannen(t, kiefer) {
	const anker = [];
	const glieder = [];
	const re = new RegExp(`(?:\\bvon|\\bab)\\s+(?:(?:der|dem|die|den|zahn)\\s+)?(${STELLE_EINZEL})(?!\\d)\\s+(?:auf|bis|nach|zu)\\s+(?:(?:die|den|der|dem|zahn)\\s+)?(${STELLE_EINZEL})(?!\\d)`, "g");
	const qs = quadrantenAus(t, kiefer);
	const dazuAnker = (z) => {
		if (!anker.includes(z)) anker.push(z);
	};
	const dazuGlied = (z) => {
		if (!glieder.includes(z) && !anker.includes(z)) glieder.push(z);
	};
	const ausSpanne = (von, bis) => {
		const zs = zahnSpanne(von, bis);
		if (zs.length < 2) return;
		dazuAnker(zs[0]);
		dazuAnker(zs[zs.length - 1]);
		for (const z of zs.slice(1, -1)) dazuGlied(z);
	};
	for (const m of t.matchAll(re)) {
		const a = stelleNummer(m[1]);
		const b = stelleNummer(m[2]);
		if (!a || !b) continue;
		if (a === b) {
			const kieferSet = new Set(qs.map((q) => q === "1" || q === "2" ? "OK" : "UK"));
			if (kieferSet.has("OK")) ausSpanne(`1${a}`, `2${b}`);
			if (kieferSet.has("UK")) ausSpanne(`4${a}`, `3${b}`);
			continue;
		}
		for (const q of qs) ausSpanne(q + a, q + b);
	}
	return {
		anker,
		glieder
	};
}
var satzteile = (t) => norm$1(t).split(/[,;.]| und nach | sowie | dazu | außerdem | ausserdem /).map((s) => s.trim()).filter(Boolean);
var KIEFER_WORT = /\b(ok|o\.k\.|oberkiefer|oben|uk|u\.k\.|unterkiefer|unten)\b/g;
/** Text an jeder Kiefer-Nennung schneiden: „Im Oberkiefer … und im Unterkiefer …“ → je Kiefer ein Abschnitt */
function kieferAbschnitte(text) {
	const t = norm$1(text);
	const treffer = [...t.matchAll(KIEFER_WORT)];
	const out = [];
	const schnitt = (i) => {
		if (i === 0) return 0;
		const von = (treffer[i - 1].index ?? 0) + treffer[i - 1][0].length;
		const grenzen = [...t.slice(von, treffer[i].index).matchAll(/[,;.]| und | sowie | dazu | außerdem | ausserdem /g)];
		const g = grenzen[grenzen.length - 1];
		return g ? von + (g.index ?? 0) : treffer[i].index;
	};
	treffer.forEach((m, i) => {
		const kiefer = /^(ok|o\.k\.|oberkiefer|oben)$/.test(m[1]) ? "OK" : "UK";
		const stueck = t.slice(schnitt(i), i + 1 < treffer.length ? schnitt(i + 1) : t.length);
		const letzter = out[out.length - 1];
		if (letzter?.kiefer === kiefer) letzter.text += stueck;
		else out.push({
			kiefer,
			text: stueck
		});
	});
	return out;
}
/** „Totalprothese für beide Kiefer“, „oben und unten“ – eine Versorgung für OK und UK */
var BEIDE_KIEFER = /\bbeide(n)? kiefer|\bbeidkiefer|\bok und uk\b|\buk und ok\b|\boben und unten\b|\bunten und oben\b/;
var KIEFERWEIT = /* @__PURE__ */ new Set([
	"teleskopprothese",
	"totalprothese",
	"locator",
	"steg",
	"allon"
]);
function versorgungIn(t, coverDenture) {
	return prothetikIn(t).versorgung ?? (coverDenture ? "teleskopprothese" : void 0);
}
function auftragVerstehen(text) {
	const ohne = ohneKieferBefund(text);
	if (ohne) return {
		...auftragVerstehen(ohne),
		text
	};
	const auftrag = einzelAuftrag(text);
	const abschnitte = kieferAbschnitte(text);
	const beide = BEIDE_KIEFER.test(norm$1(text));
	const gemeinsam = KIEFER_GEMEINSAM.test(norm$1(text)) && KIEFERWEIT.has(auftrag.versorgung ?? "kronen") && new Set(abschnitte.map((a) => einzelAuftrag(a.text).versorgung).filter(Boolean)).size <= 1;
	const fuerBeide = beide && (auftrag.versorgung === "totalprothese" || auftrag.versorgung === "allon");
	if (abschnitte.length < 2 && !fuerBeide && !gemeinsam) return brueckenKiefer(auftrag) ?? auftrag;
	const roh = gemeinsam ? ["OK", "UK"].map((k) => einzelAuftrag(text, k)) : abschnitte.map((a) => ({
		...einzelAuftrag(a.text),
		kiefer: a.kiefer
	}));
	if (!gemeinsam) roh.forEach((x, i) => {
		const t = norm$1(abschnitte[i].text);
		if (x.versorgung || /nichts|kein/.test(t) || befundWort(t, true)) return;
		const nachbar = roh.slice(0, i).reverse().find((y) => y.versorgung) ?? roh.slice(i + 1).find((y) => y.versorgung);
		if (nachbar?.versorgung) {
			x.versorgung = nachbar.versorgung;
			if (x.allon == null && nachbar.allon) x.allon = nachbar.allon;
			if (x.versorgung === "bruecke") brueckeVerstehen(norm$1(abschnitte[i].text), x);
		}
	});
	if (fuerBeide) {
		for (const k of ["OK", "UK"]) if (!roh.some((x) => x.kiefer === k && x.versorgung)) roh.push({
			...einzelAuftrag(text),
			kiefer: k,
			versorgung: auftrag.versorgung,
			allon: auftrag.allon
		});
	}
	const teile = roh.filter((x) => x.versorgung && x.versorgung !== "kronen" && x.versorgung !== "implantatkronen" && x.versorgung !== "inlay").filter((x, i, alle) => alle.findIndex((y) => y.kiefer === x.kiefer) === i);
	const kiefer = new Set(teile.map((x) => x.kiefer));
	if (!teile.length) return auftrag;
	for (const x of teile) {
		x.pfeiler = x.pfeiler.filter((z) => kieferVon$1(z) === x.kiefer);
		if (x.glieder) x.glieder = x.glieder.filter((z) => kieferVon$1(z) === x.kiefer);
	}
	if (kiefer.size === 1) return {
		...auftrag,
		...teile[0],
		text,
		bonus: auftrag.bonus,
		haertefall: auftrag.haertefall
	};
	return {
		...auftrag,
		versorgung: teile[0].versorgung,
		kiefer: void 0,
		teile,
		pfeiler: teile.flatMap((x) => x.pfeiler),
		glieder: teile.flatMap((x) => x.glieder ?? []),
		coverDenture: teile.some((x) => x.coverDenture)
	};
}
var LISTEN_VERB = {
	entfernen: /entfern|extrah|ziehen|gezogen|raus/,
	erhalten: /bleib|erhalt|behalt|stehen/
};
var listenArt = (teil) => LISTEN_VERB.entfernen.test(teil) ? "entfernen" : LISTEN_VERB.erhalten.test(teil) ? "erhalten" : void 0;
var ersterZahnIn = (teil) => teil.search(new RegExp(`\\b${ZAHN_WORT}`));
/** „Entfernung der Zähne 15“: das Verb steht vor dem ersten Zahn, die Aufzählung danach gehört dazu */
var verbVorn = (teil, art) => {
	const zahn = ersterZahnIn(teil);
	return zahn >= 0 && teil.search(LISTEN_VERB[art]) < zahn;
};
/** „…, 22 und 25 werden entfernt“: Verb in der Mehrzahl hinter den Zähnen nimmt die Aufzählung davor mit */
function listeDanach(teil) {
	const art = teil ? listenArt(teil) : void 0;
	if (!art || !teil || /\b(?:wird|soll|muss|ist|bleibt|steht)\b/.test(teil)) return void 0;
	const zahn = ersterZahnIn(teil);
	return zahn < 0 || teil.search(LISTEN_VERB[art]) > zahn ? art : void 0;
}
var ZAEHNE_VORWORT = /^\s*(?:(?:die|der|den)\s+)?(?:zahn|z(?:ä|ae)hne)\s+/;
var nurZaehne = (teil) => NUR_ZAEHNE.test(teil) || NUR_ZAEHNE.test(teil.replace(ZAEHNE_VORWORT, ""));
function einzelAuftrag(text, kiefer) {
	const t = norm$1(text);
	const auftrag = {
		text,
		pfeiler: [],
		entfernen: [],
		erhalten: [],
		coverDenture: /co?ver.?dent|kover.?dent|deckprothese/.test(t),
		mitAchtern: /(mit|inklusive|inkl\.?|samt) (den )?achter/.test(t),
		interim: /interim|provisorisch|übergangsprothese|uebergangsprothese/.test(t),
		immediat: /immediat|sofortprothese/.test(t)
	};
	auftrag.versorgung = versorgungIn(t, auftrag.coverDenture);
	auftrag.kiefer = kiefer ?? kieferIn(t);
	const nummern = [...t.matchAll(FDI)].map((m) => kieferVon$1(m[1]));
	if (!auftrag.kiefer && nummern.length && nummern.every((k) => k === nummern[0])) auftrag.kiefer = nummern[0];
	Object.assign(auftrag, ausfuehrungIn(text));
	const worte = prothetikIn(t);
	if (worte.versorgung) auftrag.versorgung = worte.versorgung;
	if (worte.anker) auftrag.anker = worte.anker;
	if (worte.allon) auftrag.allon = worte.allon;
	if (worte.retention) auftrag.retention = worte.retention;
	if (worte.abutment) auftrag.abutment = worte.abutment;
	if (worte.kronenart) auftrag.kronenart = worte.kronenart;
	if (worte.form) auftrag.form = worte.form;
	if (worte.flaechen) auftrag.flaechen = worte.flaechen;
	if (worte.flaechenGenannt) auftrag.flaechenGenannt = true;
	if (worte.aufImplantat) auftrag.aufImplantat = true;
	if (worte.sekundaer) auftrag.sekundaer = true;
	if (worte.loeffel) auftrag.loeffel = worte.loeffel;
	if (worte.kronenart === "galvano" && !auftrag.verblendung) auftrag.verblendung = "keine";
	if (/h(ä|ae)rtefall/.test(t)) auftrag.haertefall = true;
	if (/(kein|ohne)(en)? bonus/.test(t)) auftrag.bonus = "60";
	else if (/\b(75|fünfundsiebzig|fuenfundsiebzig) ?(%|prozent)|\b(30|dreißig|dreissig) ?(%|prozent) bonus|bonus (von )?(30|dreißig|dreissig)\b|zehn jahre|bonusheft.{0,20}zehn/.test(t)) auftrag.bonus = "75";
	else if (/\b(70|siebzig) ?(%|prozent)|\b(20|zwanzig) ?(%|prozent) bonus|bonus (von )?(20|zwanzig)\b|fünf jahre bonus|fuenf jahre bonus|bonusheft/.test(t)) auftrag.bonus = "70";
	else if (/\b(60|sechzig) ?(%|prozent)/.test(t)) auftrag.bonus = "60";
	const alleTeile = satzteile(text);
	let pfeilerDavor = false;
	let listeDavor;
	alleTeile.forEach((teil, i) => {
		const zs = zaehneIn(teil, auftrag.kiefer);
		if (!zs.length) {
			listeDavor = void 0;
			return;
		}
		if (nurZaehne(teil)) {
			const fortsetzung = pfeilerDavor && !ZAEHNE_VORWORT.test(teil);
			const art = listeDavor ?? (fortsetzung ? void 0 : listeDanach(alleTeile.slice(i + 1).find((u) => !nurZaehne(u))));
			if (art) {
				auftrag[art].push(...zs.filter((z) => !auftrag[art].includes(z)));
				pfeilerDavor = false;
				return;
			}
		}
		if (NUR_ZAEHNE.test(teil)) {
			const weiter = alleTeile.slice(i + 1).find((u) => !NUR_ZAEHNE.test(u));
			const befund = weiter ? befundWort(weiter, true) : void 0;
			const zahnDort = weiter ? ersterZahnIn(weiter) : -1;
			if (pfeilerDavor && !(befund && (zahnDort < 0 || befund.index > zahnDort))) auftrag.pfeiler.push(...zs.filter((z) => !auftrag.pfeiler.includes(z)));
			return;
		}
		pfeilerDavor = false;
		listeDavor = void 0;
		const art = listenArt(teil);
		if (art) {
			auftrag[art].push(...zs);
			if (verbVorn(teil, art)) listeDavor = art;
		} else if (/teleskop|konus|doppelkrone|pfeiler|krone|anker|locator|locater|druckknopf|kugel(?:kopf|anker)|novaloc|equator|steg|inlay|onlay|tabletop|teilkrone|veneer|galvano|suprakonstruktion|abutment|auf (den|dem|die)\b|\bauf [1-4][1-8]\b/.test(teil) || (auftrag.versorgung === "implantatkronen" || auftrag.versorgung === "kronen" || auftrag.versorgung === "inlay") && /implantat|\b(?:am|an|bei|f(?:ü|ue)r) (?:zahn )?[1-4][1-8]\b|\bzahn [1-4][1-8]\b|\bregion?\b/.test(teil)) {
			const vorBefund = teil.split(BEFUND_BEGINN)[0].split(ZAEHNE_NACHGESTELLT)[0];
			const pf = vorBefund === teil ? zs : zaehneIn(vorBefund, auftrag.kiefer);
			auftrag.pfeiler.push(...pf.filter((z) => !auftrag.pfeiler.includes(z)));
			pfeilerDavor = vorBefund === teil;
		}
	});
	if (auftrag.versorgung === "bruecke") brueckeVerstehen(t, auftrag);
	if (!auftrag.kiefer && auftrag.pfeiler.length && auftrag.pfeiler.every((z) => kieferVon$1(z) === kieferVon$1(auftrag.pfeiler[0]))) auftrag.kiefer = kieferVon$1(auftrag.pfeiler[0]);
	return auftrag;
}
var BRUECKEN_SPANNE = /\b([1-4][1-8])\s*(?:bis|auf|nach|zu|-)\s*(?:zahn\s*)?([1-4][1-8])\b/g;
var GLIED_WORT = "(?:br(?:ü|ue)cken|zwischen)?glied(?:er|ern)?";
var ZAHN_LISTE = "[1-4][1-8](?:\\s*(?:,|und)\\s*[1-4][1-8])*";
var GLIED_DAVOR = new RegExp(`\\b(${ZAHN_LISTE})\\s+(?:(ist|sind|wird|werden|als)\\s+)?(?:(?:ein|eine|das|die|der|zum|zu)\\s+)?${GLIED_WORT}`, "g");
var GLIED_DANACH = new RegExp(`${GLIED_WORT}\\s+(?:(?:auf|in|bei|regio|f(?:ü|ue)r|an)\\s+)?(?:zahn\\s*)?(${ZAHN_LISTE})`, "g");
/**
* Brücke: Anker sind die Enden („von 14 auf 16“, „14 bis 16“) bzw. die genannten Kronen, Glieder die genannten
* („15 ist ein Brückenglied“) oder die Zähne zwischen genau zwei Ankern. Einzahl-Form („16 und 15 ist ein Glied“)
* nimmt nur den Zahn direkt am Glied-Wort.
*/
/** Brücken in beiden Kiefern aus einem Satz („jeweils von 4 auf 6 und von 3 auf 3“) */
function brueckenKiefer(a) {
	if (a.versorgung !== "bruecke") return void 0;
	const zs = [...a.pfeiler, ...a.glieder ?? []];
	if (new Set(zs.map(kieferVon$1)).size < 2) return void 0;
	const teile = ["OK", "UK"].map((k) => ({
		...a,
		kiefer: k,
		pfeiler: a.pfeiler.filter((z) => kieferVon$1(z) === k),
		glieder: (a.glieder ?? []).filter((z) => kieferVon$1(z) === k)
	})).filter((t) => t.pfeiler.length >= 2 && (t.glieder?.length ?? 0) > 0);
	if (teile.length < 2) return void 0;
	return {
		...a,
		kiefer: void 0,
		teile,
		pfeiler: teile.flatMap((t) => t.pfeiler),
		glieder: teile.flatMap((t) => t.glieder ?? [])
	};
}
function brueckeVerstehen(t, a) {
	const nummern = (s) => [...s.matchAll(FDI)].map((m) => m[1]);
	const spannen = [...t.matchAll(BRUECKEN_SPANNE)].filter((m) => kieferVon$1(m[1]) === kieferVon$1(m[2]));
	const anker = [];
	for (const m of spannen) for (const z of [m[1], m[2]]) if (!anker.includes(z)) anker.push(z);
	const stellen = positionsSpannen(t, a.kiefer);
	for (const z of stellen.anker) if (!anker.includes(z)) anker.push(z);
	const glieder = [];
	const dazu = (zs) => zs.forEach((z) => !glieder.includes(z) && !anker.includes(z) && glieder.push(z));
	for (const m of t.matchAll(GLIED_DAVOR)) {
		const zs = nummern(m[1]).filter((z) => !anker.includes(z));
		dazu(/sind|werden/.test(m[2] ?? "") || /glieder/.test(m[0]) ? zs : zs.slice(-1));
	}
	for (const m of t.matchAll(GLIED_DANACH)) {
		const zs = nummern(m[1]).filter((z) => !anker.includes(z));
		dazu(/glieder/.test(m[0]) ? zs : zs.slice(0, 1));
	}
	for (const m of spannen) dazu(zahnSpanne(m[1], m[2]).slice(1, -1));
	for (const z of stellen.glieder) dazu([z]);
	const pfeiler = [...anker, ...a.pfeiler.filter((z) => !anker.includes(z))].filter((z) => !glieder.includes(z));
	if (!glieder.length && pfeiler.length === 2 && kieferVon$1(pfeiler[0]) === kieferVon$1(pfeiler[1])) dazu(zahnSpanne(pfeiler[0], pfeiler[1]).slice(1, -1));
	a.pfeiler = pfeiler;
	a.glieder = glieder;
}
var BEFUND_BEGINN = /\b(?:ersetz\w*|(?:es )?fehl\w*|vorhanden|extrah\w*|entfern\w*)\b/;
/** „… und die Zähne 14 bis 17 ersetzen“: ab hier stehen Befund-Zähne, das Verb folgt erst am Ende */
var ZAEHNE_NACHGESTELLT = / und (?:die |der )?z(?:ä|ae)hne? (?=[1-4][1-8]\b)/;
/**
* Befundwörter → eHKP-Kürzel, das erste passende gilt. Die Grundart (Krone, Brückenglied, Teleskop …) bekommt
* bei „erneuerungsbedürftig“ ihr w (b → bw). `versorgung`: das Wort nennt auch eine Versorgung – im Auftrag
* („15 ist ein Brückenglied“) ist es Therapie, kein Befund.
*/
var BEFUND_ARTEN = [
	{
		re: /l(?:ü|ue)ckenschluss|l(?:ü|ue)cke (?:ist )?geschlossen/,
		code: ")("
	},
	{
		re: /implantat\w*[- ]?(?:(?:regio |zahn )?[1-4][1-8] )?(?:ist |sind |wird |werden |soll |muss )?(?:nicht erhaltungsw|entfern|explant|raus)|zu entfernende\w* implantat|explantier/,
		code: "ix"
	},
	{
		re: /implantat\w*[- ]?teleskop|teleskop\w* auf (?:dem |den |einem )?implantat/,
		code: "st",
		versorgung: true
	},
	{
		re: /implantat\w*[- ]?br(?:ü|ue)cken[- ]?glied|br(?:ü|ue)cken[- ]?glied\w* auf implantat/,
		code: "sb",
		versorgung: true
	},
	{
		re: /implantat\w*[- ]?(?:steg|verbindungselement)/,
		code: "so",
		versorgung: true
	},
	{
		re: /implantat\w*[- ]?prothese|implantatgetragene\w* prothese/,
		code: "se",
		versorgung: true
	},
	{
		re: /druckknopf|locator|locater|kugel(?:kopf|anker)|novaloc|equator/,
		code: "so",
		versorgung: true
	},
	{
		re: /implantat[- ]?kron|implantatgetragene\w* kron|kronen? auf (?:dem |einem )?implantat|suprakonstruktion/,
		code: "sk",
		versorgung: true
	},
	{
		re: /\b(?:ist|sind|hat|haben|mit|tr(?:ä|ae)gt) (?:ein(?:em)? )?implantat\w*|implantat\w* (?:ist |sind )?(?:vorhanden|intakt|drin|versorgt|in ordnung)|implantat\w*\s+(?:an|auf|in|bei|regio)|\b(?:ist|sind|bereits|schon) implantiert/,
		code: "i",
		versorgung: true
	},
	{
		re: /\b[1-4][1-8] (?:ein )?implantate?$/,
		code: "i",
		versorgung: true
	},
	{
		re: /(?:adh(?:ä|ae)siv|klebe)[- ]?br(?:ü|ue)cken[- ]?glied/,
		code: "ab",
		versorgung: true
	},
	{
		re: /adh(?:ä|ae)siv|klebebr(?:ü|ue)cke|maryland/,
		code: "a",
		versorgung: true
	},
	{
		re: /sekund(?:ä|ae)r[- ]?teil/,
		code: "t2w",
		versorgung: true
	},
	{
		re: /teleskop|doppelkrone|konuskrone/,
		code: "t",
		versorgung: true
	},
	{
		re: /br(?:ü|ue)cken[- ]?glied|zwischenglied|\bglied\b/,
		code: "b",
		versorgung: true
	},
	{
		re: /wurzelstift[- ]?kappe|stiftkappe/,
		code: "r",
		versorgung: true
	},
	{
		re: /teilkrone/,
		code: "pk",
		versorgung: true
	},
	{
		re: /teil[- ]?defekt|partielle\w* (?:substanz)?defekt/,
		code: "pw"
	},
	{
		re: /unzureichende\w* retention|retention (?:ist )?unzureichend/,
		code: "ur"
	},
	{
		re: /(?:durch|mit) (?:eine\w* |die |der )?prothese ersetzt|ersetzt durch (?:eine |die )?prothese|prothesenzahn|ersetzter zahn/,
		code: "e"
	},
	{
		re: /nicht erhaltungsw(?:ü|ue)rdig|hoffnungslos|extrah|entfern|ziehen/,
		code: "x"
	},
	{
		re: /weitgehend zerst|(?:ü|ue)berkronungsbed(?:ü|ue)rftig|krone n(?:ö|oe)tig|braucht? (?:eine )?krone|kari(?:ö|oe)s|karies|\b(?:w ?w ?w?|weh ?weh)\b/,
		code: "ww"
	},
	{
		re: /zerst(?:ö|oe)rt/,
		code: "x"
	},
	{
		re: /erneuerungsbed(?:ü|ue)rftig|krone (?:ist )?(?:kaputt|defekt|insuffizient)|\b(?:k ?w|ka ?weh)\b/,
		code: "kw"
	},
	{
		re: /(?:ü|ue)berkront|krone (?:ist )?(?:intakt|in ordnung|gut)|intakte krone|\b(?:hat|haben|mit|tr(?:ä|ae)gt|tragen) (?:eine )?kronen?\b/,
		code: "k"
	},
	{
		re: /\b[1-4][1-8] (?:eine )?kronen?$/,
		code: "k",
		versorgung: true
	},
	{
		re: /fehl|ohne zahn|l(?:ü|ue)cke|ersetz/,
		code: "f"
	},
	{
		re: /vorhanden|gesund|intakt|da\b|steh|bleib|erhalt/,
		code: ""
	}
];
var MIT_W = {
	a: "aw",
	ab: "abw",
	b: "bw",
	e: "ew",
	k: "kw",
	r: "rw",
	sb: "sbw",
	se: "sew",
	sk: "skw",
	so: "sow",
	st: "stw",
	t: "tw"
};
var ERNEUERN = /erneuer|kaputt|\bdefekt|insuffizient|undicht|gebrochen|locker/;
/** „15 sk“, „16 ist k w“: das Kürzel selbst am Ende des Satzteils */
var KUERZEL_AM_ENDE = new RegExp(`(?:^|\\s)(${[...Object.keys(BEFUND_KUERZEL), "i"].sort((a, b) => b.length - a.length).map((k) => k.replace(/[()]/g, "\\$&")).join("|")})$`);
/** Befund eines Satzteils → Kürzel und Fundstelle; `imAuftrag` überspringt Kürzel und Wörter, die auch eine Versorgung nennen */
function befundWort(teil, imAuftrag = false) {
	if (!imAuftrag) {
		const k = KUERZEL_AM_ENDE.exec(teil.trimEnd().replace(/(?:\s[a-z2])+$/, (m) => ` ${m.replace(/\s/g, "")}`));
		if (k) return {
			code: k[1],
			index: k.index
		};
	}
	for (const art of BEFUND_ARTEN) {
		if (imAuftrag && art.versorgung) continue;
		const m = art.re.exec(teil);
		if (!m) continue;
		const w = ERNEUERN.test(teil);
		if (art.code === "pk") return {
			code: w ? "pkw" : /n(?:ö|oe)tig|braucht|bed(?:ü|ue)rftig/.test(teil) ? "pw" : "k",
			index: m.index
		};
		return {
			code: w && MIT_W[art.code] || art.code,
			index: m.index
		};
	}
}
var ZAHN_WORT = "(?:[1-4][1-8]|(?:einser|zweier|dreier|vierer|f(?:ü|ue)nfer|sechser|siebe?ner|achter)n?|eckz(?:ah|äh|aeh)ne?n?|front\\w*)";
new RegExp(`^(?:(?:die|der|den|zahn|z(?:ä|ae)hne)\\s+)?(${ZAHN_WORT}(?:\\s*(?:bis|-|,)\\s*${ZAHN_WORT})*)\\s*(.*)$`);
new RegExp(`^(?:(?:die|der|den|zahn|z(?:ä|ae)hne)\\s+)?${ZAHN_WORT}(?:\\s*(?:bis|-)\\s*${ZAHN_WORT})?$`);
/** „Alle Zähne sind gesund“, „es fehlt keiner“: Antwort auf die Befundfrage – die übrigen Zähne sind vorhanden */
var ALLE_DA = /\balle (?:anderen |(?:ü|ue)brigen )?z(?:ä|ae)hne (?:sind )?(?:noch )?(?:gesund|vorhanden|da|intakt|in ordnung|erhalten)\b|\bes fehlt (?:kein zahn|keiner|nichts)\b|\bnichts fehlt\b|\bkeine z(?:ä|ae)hne fehlen\b|\bvoll ?bezahnt\b|\b(?:sind|ist) (?:noch )?alle (?:da|vorhanden|gesund|intakt|drin)\b|\bfehl(?:t|en) (?:kein(?:er|e)?|nichts)\b|\bkein(?:er|e)? fehl(?:t|en)\b/;
/** „Unterkiefer ist voll bezahnt“, „unten sind alle da“: Befund über einen ganzen Kiefer, keine Versorgung */
var kieferBefundTeil = (teil) => !!kieferIn(` ${teil} `) && ALLE_DA.test(` ${teil} `) && !versorgungIn(teil, false) && !VERSORGUNGS_TEIL.test(teil);
/** Auftrag ohne seine Kiefer-Befundteile – sonst öffnet „Unterkiefer ist voll bezahnt“ einen eigenen Versorgungs-Abschnitt; '' wenn es keine gibt */
function ohneKieferBefund(text) {
	const teile = satzteile(text);
	const rest = teile.filter((t) => !kieferBefundTeil(t));
	return rest.length && rest.length < teile.length ? rest.join(", ") : "";
}
var VERSORGUNGS_TEIL = /prothese|teleskop|konus|doppelkrone|krone|anker|pfeiler|co?ver.?dent|kover|bonus|scan|abdruck|abform|gold|zirkon|keramik|\bnem\b|erstell|plan|hkp|kostenpl|inlay|onlay|tabletop|teilkrone|galvano|abutment|suprakonstruktion|locator|druckknopf|kugelkopf|novaloc|steg|all[\s-]*on|veneer/;
/** Befund-Satzteile aus einem gesprochenen Auftrag („… die Sechser und Siebener fehlen …“), sonst '' */
/** Satzteil, der nur Zähne aufzählt („die Vierer“, „Fünfer“) – sein Verb steht weiter hinten */
var NUR_ZAEHNE = /^(?:(?:die|der|den|und|sowie|auch|noch|bis|[1-4][1-8]|\d(?:er|ern)|einser|zweier|dreier|eckz(?:ah|äh|aeh)ne?n?|vierer|f(?:ü|ue)nfer|sechser|siebe?ner|achter)n?\s*)+$/;
var liste = (zs) => zs.length <= 1 ? zs.join("") : `${zs.slice(0, -1).join(", ")} und ${zs[zs.length - 1]}`;
var fehlt = (b, z) => FEHLEND.has((b[z] ?? "").trim().toLowerCase());
/** i/sk/st: Implantat oder implantatgetragene Krone. ix kommt raus und ist ebenfalls kein Zahn. */
var IMPLANTAT_BLEIBT = /^(i|sk|skw|st|stw)$/;
var implantatBleibt = (code) => IMPLANTAT_BLEIBT.test(code.trim().toLowerCase());
/** Implantat ohne Suprakonstruktion. Das Kürzel ist immer i. ix ist schon als nicht erhaltungswürdig markiert und bleibt keine Lücke, die man noch einmal fragen muss. */
var implantatOhneAufbau = (code) => /^(i|ix)$/.test((code ?? "").trim().toLowerCase());
/** sk: Suprakonstruktion mit klinisch intakter Krone. Keine Behandlung, Zeile R und TP bleiben leer. */
var implantatkroneIntakt = (code) => (code ?? "").trim().toLowerCase() === "sk";
var zahnStehtNoch = (b, z) => {
	if (!(z in b) || fehlt(b, z)) return false;
	const k = (b[z] ?? "").trim().toLowerCase();
	return !implantatBleibt(k) && !implantatOhneAufbau(k);
};
/** Erzeugt aus Auftrag und Befund einen gerechneten Plan – oder eine Rückfrage. */
function planAusAuftrag(auftrag, befundRoh, optionen = {}) {
	const befund = Object.fromEntries(Object.entries(befundRoh).map(([z, b]) => [z, (b ?? "").trim().toLowerCase()]));
	const hinweise = [];
	const teile = auftrag.teile?.length ? auftrag.teile : [auftrag];
	for (const teil of teile) for (const z of teil.entfernen) if (!implantatOhneAufbau(befund[z])) befund[z] = "x";
	for (const teil of teile) {
		if (!teil.versorgung) return {
			status: "rueckfrage",
			grund: "versorgung",
			frage: "Welche Versorgung soll ich planen – zum Beispiel Teleskopprothese, Totalprothese oder Kronen?"
		};
		if (!teil.kiefer && ![
			"kronen",
			"bruecke",
			"implantatkronen",
			"inlay"
		].includes(teil.versorgung ?? "")) return {
			status: "rueckfrage",
			grund: "kiefer",
			frage: "Für welchen Kiefer – Oberkiefer oder Unterkiefer?"
		};
	}
	const ohneBefundOk = teile.every((x) => x.versorgung === "totalprothese" || x.versorgung === "allon");
	if (!Object.keys(befund).length && !ohneBefundOk) return {
		status: "rueckfrage",
		grund: "befund_fehlt",
		frage: "Ich habe keinen Befund. Welche Zähne fehlen, und welche sind vorhanden?"
	};
	const tp = {};
	for (const teil of teile) {
		const r = teil.versorgung === "kronen" ? kronenPlanen(teil, befund, tp) : teil.versorgung === "inlay" ? inlayPlanen(teil, befund, tp, hinweise) : teil.versorgung === "bruecke" ? brueckePlanen(teil, befund, tp, hinweise) : teil.versorgung === "implantatkronen" ? implantatPlanen(teil, befund, tp) : teil.versorgung === "allon" ? allonPlanen(teil, befund, tp, hinweise) : kieferPlanen(teil, teil.kiefer, befund, tp, hinweise);
		if (r) return r;
	}
	return planRechnen(auftrag, teile, befund, tp, hinweise, optionen);
}
function brueckePlanen(auftrag, befund, tp, hinweise) {
	const anker = auftrag.pfeiler;
	const glieder = auftrag.glieder ?? [];
	if (anker.length < 2 || !glieder.length || new Set([...anker, ...glieder].map(kieferVon$1)).size > 1) return {
		status: "rueckfrage",
		grund: "pfeiler",
		frage: "Von welchem bis zu welchem Zahn soll die Brücke gehen – zum Beispiel von 14 auf 16?"
	};
	const implant = !!auftrag.aufImplantat || anker.some((z) => befund[z] === "i" || (befund[z] ?? "").startsWith("s"));
	const ankerFehlt = anker.filter((z) => fehlt(befund, z) && befund[z] !== "x" && !implant);
	if (ankerFehlt.length) return {
		status: "rueckfrage",
		grund: "pfeiler_fehlt",
		zaehne: ankerFehlt,
		frage: `Laut Befund ${ankerFehlt.length > 1 ? "fehlen" : "fehlt"} ${liste(ankerFehlt)}. Auf welchen Zähnen soll die Brücke stattdessen verankert sein?`
	};
	const stehen = glieder.filter((z) => z in befund && !fehlt(befund, z) && befund[z] !== "i");
	if (stehen.length) return {
		status: "rueckfrage",
		grund: "glied_vorhanden",
		zaehne: stehen,
		frage: `Laut Befund ${stehen.length > 1 ? "sind" : "ist"} ${liste(stehen)} noch vorhanden. Soll ich ${stehen.length > 1 ? "sie" : "ihn"} als zu entfernen planen? Dann sagen Sie zum Beispiel: ${stehen[0]} wird entfernt.`
	};
	for (const z of glieder) if (!(z in befund)) befund[z] = "f";
	const keramik = !!(auftrag.werkstoff && WERKSTOFFE$1[auftrag.werkstoff].art === "keramik");
	const vollverblendet = auftrag.verblendung === "voll";
	if (implant) {
		for (const z of anker) {
			if (!(z in befund)) befund[z] = "f";
			tp[z] = implantKrone(auftrag);
		}
		for (const z of glieder) tp[z] = implantGlied(auftrag);
		if (([
			"14",
			"16",
			"13",
			"23"
		].every((z) => anker.includes(z)) || [
			"44",
			"46",
			"43",
			"33"
		].every((z) => anker.includes(z))) && !hinweise.some((h) => h.startsWith("Brücken je Kiefer"))) hinweise.push("Brücken je Kiefer von 4 auf 6 beidseits und von 3 auf 3. Die Siebener liegen außerhalb der Brücken und werden nicht ersetzt.");
		if (vollverblendet && auftrag.form === "vollanatomisch" && !hinweise.some((h) => h.startsWith("Vollverblendung auf dem Zirkon"))) hinweise.push("Vollverblendung auf dem Zirkon: keramische Verblendung (BEB 2612), nicht die unverblendete Vollanatomie.");
	} else if (vollverblendet || keramik && auftrag.form !== "vollanatomisch") {
		for (const z of anker) tp[z] = "KM";
		for (const z of glieder) tp[z] = "BM";
	} else if (auftrag.form === "vollanatomisch") {
		for (const z of anker) tp[z] = "ZA";
		for (const z of glieder) tp[z] = "ZAB";
	} else if (keramik) {
		for (const z of anker) tp[z] = "KM";
		for (const z of glieder) tp[z] = "BM";
	}
}
var keramikAuftrag = (a) => !!(a.werkstoff && WERKSTOFFE$1[a.werkstoff].art === "keramik");
/** Implantatkrone: 2200, als Brückenanker 5000. Eine genannte Vollverblendung geht vor der unverblendeten Vollanatomie. */
function implantKrone(a) {
	if (a.verblendung === "voll") return "SKM";
	if (a.form === "vollanatomisch") return "ZAS";
	if (keramikAuftrag(a)) return "SKM";
	if (a.verblendung === "teil" || a.verblendung === "vestibulaer") return "SKV";
	return "SK";
}
function implantGlied(a) {
	if (a.verblendung === "voll") return "SBM";
	if (a.form === "vollanatomisch") return "ZAB";
	if (keramikAuftrag(a)) return "SBM";
	return "SB";
}
/** Implantatkronen (TP SK) auf fehlenden Zähnen; ein laut Befund stehender Zahn muss erst als „wird entfernt“ genannt sein */
function implantatPlanen(auftrag, befund, tp) {
	const sitze = auftrag.pfeiler;
	if (!sitze.length) return {
		status: "rueckfrage",
		grund: "pfeiler",
		frage: "Auf welche Zähne sollen die Implantatkronen – zum Beispiel auf 14 und 15?"
	};
	const stehen = sitze.filter((z) => zahnStehtNoch(befund, z));
	if (stehen.length) return {
		status: "rueckfrage",
		grund: "zahn_vorhanden",
		zaehne: stehen,
		frage: `Laut Befund ${stehen.length > 1 ? "sind" : "ist"} ${liste(stehen)} noch vorhanden. ${stehen.length > 1 ? "Werden sie" : "Wird er"} vorher entfernt? Dann sagen Sie zum Beispiel: ${stehen[0]} wird entfernt.`
	};
	for (const z of sitze) {
		if (!(z in befund)) befund[z] = "f";
		tp[z] = implantKrone(auftrag);
	}
}
function kieferPlanen(auftrag, kiefer, befund, tp, hinweise) {
	const name = kiefer === "OK" ? "Oberkiefer" : "Unterkiefer";
	{
		const reihe = REIHE[kiefer];
		const unbekannt = reihe.filter((z) => !(z in befund) && !istWeisheitszahn$1(z));
		if (unbekannt.length === reihe.filter((z) => !istWeisheitszahn$1(z)).length) {
			if (auftrag.versorgung !== "totalprothese") return {
				status: "rueckfrage",
				grund: "befund_fehlt",
				frage: `Für den ${name} habe ich keinen Befund. Welche Zähne fehlen dort?`
			};
			for (const z of reihe) befund[z] = "f";
			hinweise.push(`${name}: kein Befund genannt – für die Totalprothese als zahnlos angenommen.`);
			unbekannt.length = 0;
		}
		const ankerVersorgung = auftrag.versorgung === "teleskopprothese" || auftrag.versorgung === "locator" || auftrag.versorgung === "steg";
		const pfeiler = ankerVersorgung ? auftrag.pfeiler.filter((z) => kieferVon$1(z) === kiefer) : [];
		if (ankerVersorgung && !pfeiler.length) return {
			status: "rueckfrage",
			grund: "pfeiler",
			frage: `Auf welchen Zähnen oder Implantaten soll ${auftrag.versorgung === "locator" ? "die Druckknöpfe oder Kugelköpfe" : auftrag.versorgung === "steg" ? "der Implantatsteg" : "die Teleskope"} sitzen?`
		};
		if ((auftrag.versorgung === "locator" || auftrag.versorgung === "steg" || !!auftrag.aufImplantat) && pfeiler.length) {
			const stehen = pfeiler.filter((z) => z in befund && !fehlt(befund, z));
			if (stehen.length) return {
				status: "rueckfrage",
				grund: "zahn_vorhanden",
				zaehne: stehen,
				frage: `Laut Befund ${stehen.length > 1 ? "sind" : "ist"} ${liste(stehen)} noch vorhanden. ${stehen.length > 1 ? "Werden sie" : "Wird er"} vorher entfernt? Dann sagen Sie zum Beispiel: ${stehen[0]} wird entfernt.`
			};
			for (const z of pfeiler) if (!(z in befund)) befund[z] = "f";
		} else {
			const ohnePfeiler = pfeiler.filter((z) => fehlt(befund, z));
			if (ohnePfeiler.length) return {
				status: "rueckfrage",
				grund: "pfeiler_fehlt",
				zaehne: ohnePfeiler,
				frage: `Laut Befund ${ohnePfeiler.length > 1 ? "fehlen" : "fehlt"} ${liste(ohnePfeiler)}. Auf welchen Zähnen sollen die Teleskope stattdessen sitzen?`
			};
		}
		const nackt = reihe.filter((z) => implantatOhneAufbau(befund[z]) && !pfeiler.includes(z));
		const kronen = reihe.filter((z) => implantatkroneIntakt(befund[z]) && !pfeiler.includes(z));
		const offen = reihe.filter((z) => !istWeisheitszahn$1(z) && z in befund && !fehlt(befund, z) && !nackt.includes(z) && !kronen.includes(z) && !pfeiler.includes(z) && !auftrag.erhalten.includes(z));
		if ((auftrag.coverDenture || auftrag.versorgung === "totalprothese" || auftrag.versorgung === "locator" || auftrag.versorgung === "steg") && offen.length) return {
			status: "rueckfrage",
			grund: "restzaehne",
			zaehne: offen,
			frage: `Im ${kiefer === "OK" ? "Oberkiefer" : "Unterkiefer"} ${offen.length > 1 ? "stehen" : "steht"} noch ${liste(offen)}. ${offen.length > 1 ? "Sollen die" : "Soll er"} erhalten bleiben oder entfernt werden?`
		};
		if (unbekannt.length) hinweise.push(`Kein Befund für ${liste(unbekannt)} – als vorhanden angenommen.`);
		const achter = reihe.filter((z) => istWeisheitszahn$1(z) && !(z in befund));
		for (const z of achter) befund[z] = "f";
		if (achter.length) hinweise.push(`${liste(achter)} nicht genannt – als fehlend angenommen.`);
		const keramikTel = keramikAuftrag(auftrag);
		const bogen = pfeiler.map((z) => reihe.indexOf(z)).filter((i) => i >= 0);
		const von = bogen.length ? Math.min(...bogen) : -1;
		const bis = bogen.length ? Math.max(...bogen) : -1;
		for (const z of pfeiler) tp[z] = ankerKuerzel(auftrag, z, keramikTel);
		for (const z of reihe) {
			if (pfeiler.includes(z) || !fehlt(befund, z) && !nackt.includes(z)) continue;
			if (istWeisheitszahn$1(z) && !auftrag.mitAchtern) continue;
			const i = reihe.indexOf(z);
			tp[z] = auftrag.versorgung === "steg" && i > von && i < bis ? "SEO" : "E";
		}
		if (nackt.length && (auftrag.versorgung === "totalprothese" || auftrag.coverDenture)) hinweise.push(`${name}: Implantate an ${liste(nackt)} ohne Suprakonstruktion bleiben liegen und gelten für die Prothese wie fehlende Zähne.`);
		if (kronen.length) hinweise.push(`${name}: Implantatkronen an ${liste(kronen)} sind intakt (sk). In Zeile R und TP bleibt das Feld leer.`);
		if (auftrag.versorgung === "locator") hinweise.push(`${auftrag.anker === "kugel" ? "Kugelkopfanker" : "Druckknopfanker"} angenommen: GOZ 5030 je Implantat und GOZ 5080 je Verbindungselement, Matrize und Patrize zusammen.`);
		if (auftrag.versorgung === "steg") hinweise.push("Implantatsteg angenommen: je Spanne eine Stegverbindung, je Implantat eine Kappe zur Aufnahme des Stegs.");
		if (keramikTel && auftrag.versorgung === "teleskopprothese") hinweise.push("Zirkon-Primärteleskop angenommen: Teleskopkrone plus Zuschlag für Keramik, das Sekundärteil bleibt das Teleskop.");
		if (auftrag.coverDenture) hinweise.push("Cover-Denture: gaumen- bzw. schleimhautgetragene Deckprothese auf den Teleskopen. Metallbasis (Befund 4.5) nur bei Notwendigkeit ankreuzen.");
	}
}
function ankerKuerzel(a, z, keramikTel) {
	if (a.versorgung === "locator" || a.versorgung === "steg") return "SO";
	if (a.sekundaer) return a.verblendung === "voll" ? "T2M" : a.verblendung === "keine" ? "T2" : imVerblendbereich(z) ? "T2V" : "T2";
	if (keramikTel) return `${a.aufImplantat ? "STZ" : "TZ"}${a.verblendung === "voll" ? "V" : ""}`;
	if (a.aufImplantat) return a.verblendung === "voll" ? "STM" : a.verblendung === "keine" ? "ST" : imVerblendbereich(z) ? "STV" : "ST";
	if (a.verblendung === "voll") return "TM";
	if (a.verblendung === "keine") return "T";
	return imVerblendbereich(z) ? "TV" : "T";
}
function kronenKuerzel(a) {
	const keramik = keramikAuftrag(a);
	if (a.kronenart === "veneer") return "VE";
	if (a.kronenart === "teilkrone" || a.kronenart === "tabletop") return keramik ? "PKM" : "PK";
	if (a.kronenart === "galvano") return "K";
	if (a.form === "vollanatomisch") return "ZA";
	if (keramik) return "KM";
}
function kronenPlanen(auftrag, befund, tp) {
	const kronen = auftrag.pfeiler;
	if (!kronen.length) return {
		status: "rueckfrage",
		grund: "pfeiler",
		frage: "Welche Zähne sollen überkront werden?"
	};
	if (!!(auftrag.kronenart || auftrag.form === "vollanatomisch")) {
		const weg = kronen.filter((z) => fehlt(befund, z));
		if (weg.length) return {
			status: "rueckfrage",
			grund: "zahn_vorhanden",
			zaehne: weg,
			frage: `${liste(weg)} ${weg.length > 1 ? "fehlen" : "fehlt"}. Eine Krone, ein Tabletop oder ein Veneer braucht den Zahn.`
		};
		for (const z of kronen) if (!(z in befund)) befund[z] = "";
	} else {
		const ohneBefund = kronen.filter((z) => !KRONE_NOETIG.has(befund[z] ?? ""));
		if (ohneBefund.length) return {
			status: "rueckfrage",
			grund: "krone_befund",
			zaehne: ohneBefund,
			frage: `Für ${liste(ohneBefund)} steht im Befund keine Kronenbedürftigkeit. Ist ${ohneBefund.length > 1 ? "sie" : "er"} überkronungsbedürftig oder ist die Krone erneuerungsbedürftig?`
		};
	}
	for (const z of kronen) {
		const k = kronenKuerzel(auftrag);
		if (k) tp[z] = k;
	}
}
function inlayPlanen(auftrag, befund, tp, hinweise) {
	const zs = auftrag.pfeiler;
	if (!zs.length) return {
		status: "rueckfrage",
		grund: "pfeiler",
		frage: "Auf welchen Zähnen soll das Inlay oder Onlay sitzen?"
	};
	const weg = zs.filter((z) => fehlt(befund, z));
	if (weg.length) return {
		status: "rueckfrage",
		grund: "zahn_vorhanden",
		zaehne: weg,
		frage: `${liste(weg)} ${weg.length > 1 ? "fehlen" : "fehlt"}. Ein Inlay oder Onlay braucht den Zahn.`
	};
	const keramik = keramikAuftrag(auftrag);
	const fl = auftrag.flaechen ?? 2;
	for (const z of zs) {
		if (!(z in befund)) befund[z] = "";
		tp[z] = auftrag.kronenart === "onlay" ? keramik ? "ONK" : "ON" : `${keramik ? "C" : "I"}${fl}`;
	}
	if (auftrag.kronenart === "onlay") hinweise.push("Onlay mehrflächig nach GOZ 2170 angenommen. Deckt es Höcker, ist es eine Teilkrone nach GOZ 2220 – dann Teilkrone sagen.");
	else if (!auftrag.flaechenGenannt) hinweise.push("Flächen nicht genannt, zweiflächig angenommen (GOZ 2160).");
}
var zahnFrage = (zs) => zs.length > 1 ? `Die Zähne ${liste(zs)} stehen noch. Werden sie vorher entfernt?` : `Der Zahn ${zs[0]} steht noch. Wird er vorher entfernt?`;
/** Festsitzende Ganzkieferbrücke auf 4 oder 6 Implantaten. Ohne genannte Sitze gelten die üblichen Positionen. */
function allonPlanen(auftrag, befund, tp, hinweise) {
	const kiefer = auftrag.kiefer;
	if (!kiefer) return {
		status: "rueckfrage",
		grund: "kiefer",
		frage: "All-on-4 oder All-on-6 – für welchen Kiefer?"
	};
	const n = auftrag.allon ?? 4;
	const name = kiefer === "OK" ? "Oberkiefer" : "Unterkiefer";
	const reihe = REIHE[kiefer];
	const genannt = auftrag.pfeiler.filter((z) => kieferVon$1(z) === kiefer);
	let sitze = genannt.length && genannt.length < n ? [.../* @__PURE__ */ new Set([...ALLON_SITZ[n][kiefer], ...genannt])] : genannt.length >= n ? [...genannt] : [...ALLON_SITZ[n][kiefer]];
	if (genannt.length) sitze.sort((a, b) => reihe.indexOf(a) - reihe.indexOf(b));
	if (!genannt.length) hinweise.push(`All-on-${n} ${name}: übliche Implantatpositionen ${sitze.join(", ")} angenommen.`);
	if (reihe.filter((z) => !(z in befund) && !istWeisheitszahn$1(z)).length === reihe.filter((z) => !istWeisheitszahn$1(z)).length) {
		for (const z of reihe) befund[z] = "f";
		hinweise.push(`${name}: kein Befund genannt – für All-on-${n} als zahnlos angenommen.`);
	}
	const enden = () => sitze.map((z) => reihe.indexOf(z)).filter((i) => i >= 0);
	let [von, bis] = [Math.min(...enden()), Math.max(...enden())];
	for (const z of reihe.slice(von, bis + 1)) if (implantatBleibt(befund[z] ?? "") && !sitze.includes(z)) sitze.push(z);
	sitze.sort((a, b) => reihe.indexOf(a) - reihe.indexOf(b));
	[von, bis] = [Math.min(...enden()), Math.max(...enden())];
	const imBogen = reihe.slice(von, bis + 1);
	const glieder = imBogen.filter((z) => !sitze.includes(z));
	const voraus = `All-on-${n} im ${name} ist eine festsitzende Brücke auf ${n === 6 ? "sechs" : "vier"} Implantaten. Dafür muss der Kiefer zahnlos sein.`;
	const stehen = reihe.filter((z) => imBogen.includes(z) && zahnStehtNoch(befund, z));
	if (stehen.length) return {
		status: "rueckfrage",
		grund: sitze.some((z) => stehen.includes(z)) ? "zahn_vorhanden" : "glied_vorhanden",
		zaehne: stehen,
		frage: `${voraus} ${zahnFrage(stehen)}`
	};
	const aussen = reihe.filter((z) => !imBogen.includes(z) && !istWeisheitszahn$1(z) && zahnStehtNoch(befund, z));
	if (aussen.length) return {
		status: "rueckfrage",
		grund: "restzaehne",
		zaehne: aussen,
		frage: `${voraus} ${zahnFrage(aussen)} Hinter dem letzten Implantat setze ich keine Freiendglieder.`
	};
	const bestehend = sitze.filter((z) => implantatBleibt(befund[z] ?? ""));
	const implantAussen = reihe.filter((z) => !sitze.includes(z) && implantatBleibt(befund[z] ?? ""));
	for (const z of reihe) {
		const k = (befund[z] ?? "").trim().toLowerCase();
		if (implantatBleibt(k) && k !== "i") befund[z] = "i";
		else if (k === "ix") befund[z] = "f";
	}
	if (bestehend.length) hinweise.push(`${name}: die Implantate an ${liste(bestehend)} bleiben. Die All-on-${n} sitzt darauf.`);
	if (implantAussen.length) hinweise.push(`${name}: Implantate an ${liste(implantAussen)} liegen außerhalb der All-on-${n} und bleiben.`);
	for (const z of sitze) {
		if (!(z in befund)) befund[z] = "f";
		tp[z] = implantKrone(auftrag);
	}
	for (const z of glieder) {
		if (!(z in befund)) befund[z] = "f";
		tp[z] = implantGlied(auftrag);
	}
	const distal = [];
	for (const z of reihe) {
		if (tp[z]) continue;
		if (!(z in befund)) befund[z] = "f";
		tp[z] = ")(";
		if (!istWeisheitszahn$1(z)) distal.push(z);
	}
	if (distal.length) hinweise.push(`All-on-${n}: hinter dem letzten Implantat keine Freiendglieder – ${liste(distal)} werden nicht ersetzt.`);
	hinweise.push(`All-on-${n} angenommen: festsitzende implantatgetragene Brücke, je Implantat ein Anker und je Spanne ein Brückenglied. Der Festzuschuss folgt dem Befund des zahnlosen Kiefers.`);
}
function planRechnen(auftrag, teile, befund, tp, hinweise, optionen) {
	const plan = leererPlan();
	plan.patient = {
		...plan.patient,
		...optionen.patient
	};
	for (const [z, b] of Object.entries(befund)) if (plan.zaehne[z]) plan.zaehne[z].B = b;
	for (const [z, t] of Object.entries(tp)) plan.zaehne[z].TP = t;
	plan.abformung = auftrag.abformung ?? optionen.abformung ?? "abdruck";
	if (!auftrag.abformung && !optionen.abformung) hinweise.push("Abformung nicht genannt – konventioneller Abdruck angenommen.");
	if (teile.some((x) => x.versorgung === "teleskopprothese" || x.versorgung === "locator" || x.versorgung === "steg")) plan.abformungProthese = plan.abformung;
	const bonus = auftrag.bonus ?? optionen.bonus;
	plan.zuschuss = {
		bonus: bonus ?? "60",
		haertefall: !!(auftrag.haertefall ?? optionen.haertefall)
	};
	if (!bonus) hinweise.push("Bonus nicht bekannt – 60 % angenommen.");
	const labor = auftrag.labor ?? optionen.labor;
	plan.einstellungen = {
		...plan.einstellungen,
		...optionen.einstellungen,
		...labor ? { labor } : {},
		...optionen.kzv ? { kzv: optionen.kzv } : {},
		...optionen.praxisPlz ? { praxisPlz: optionen.praxisPlz } : {}
	};
	const system = auftrag.implantatSystem ?? optionen.implantatSystem;
	const abutment = auftrag.abutment ?? (auftrag.retention === "verschraubt" ? "individuell" : auftrag.retention === "zementiert" ? "standard" : void 0);
	if (system || abutment || auftrag.loeffel && plan.abformung !== "scan") plan.implantat = {
		...plan.implantat,
		...system ? { system } : {},
		...abutment ? { abutment } : {},
		...auftrag.loeffel && plan.abformung !== "scan" ? { abformung: auftrag.loeffel } : {}
	};
	const haltung = [auftrag.retention === "verschraubt" ? "verschraubte" : auftrag.retention === "zementiert" ? "zementierte" : "", auftrag.form === "vollanatomisch" && auftrag.versorgung !== "kronen" && auftrag.versorgung !== "bruecke" ? "vollanatomische" : ""].filter(Boolean).join(" ");
	const ankerGesagt = auftrag.allon ? `All-on-${auftrag.allon}` : auftrag.anker === "kugel" ? "Kugelkopfanker" : auftrag.versorgung === "locator" ? /locator|novaloc|equator/i.test(auftrag.text) ? "Locator" : "Druckknopfanker" : auftrag.versorgung === "steg" ? "Implantatsteg" : auftrag.kronenart === "galvano" && auftrag.versorgung === "teleskopprothese" ? "Galvanoteleskope" : keramikAuftrag(auftrag) && auftrag.versorgung === "teleskopprothese" ? "Zirkon-Primärteleskope" : void 0;
	const kronenArt = auftrag.kronenart === "inlay" ? keramikAuftrag(auftrag) ? "Keramikinlays" : "Inlays" : auftrag.kronenart === "onlay" ? "Onlays" : auftrag.kronenart === "tabletop" ? "Tabletops" : auftrag.kronenart === "teilkrone" ? "Teilkronen" : auftrag.kronenart === "veneer" ? "Veneers" : auftrag.kronenart === "galvano" && auftrag.versorgung !== "teleskopprothese" ? "Galvanokronen" : auftrag.form === "vollanatomisch" && (auftrag.versorgung === "kronen" || auftrag.versorgung === "bruecke") ? "vollanatomische Zirkonkronen" : void 0;
	const abutmentWort = auftrag.abutment === "keramik" ? "mit Keramikabutment" : auftrag.abutment === "individuell" ? "mit individuellem Abutment" : auftrag.abutment === "standard" ? "mit konfektioniertem Abutment" : void 0;
	plan.einstellungen = {
		...plan.einstellungen,
		...ankerGesagt ? { ankerGesagt } : {},
		...haltung ? { haltung } : {},
		...kronenArt ? { kronenArt } : {},
		...abutmentWort ? { abutmentWort } : {}
	};
	if (auftrag.retention === "verschraubt") {
		const welches = auftrag.abutment === "keramik" ? "Keramikabutment auf Ti-Base (BEB 6906)" : auftrag.abutment === "standard" ? "konfektioniertes Abutment (BEB 4421)" : "individuelles Abutment auf Ti-Base (BEB 2033)";
		hinweise.push(`Verschraubt angenommen: Verschraubung und Schraubenkanal sind in der Kronenposition enthalten. ${welches}.`);
	} else if (auftrag.retention === "zementiert") {
		const welches = auftrag.abutment === "keramik" ? "Keramikabutment (BEB 6906)" : auftrag.abutment === "individuell" ? "individuelles Abutment (BEB 2033)" : "konfektioniertes Abutment (BEB 4421)";
		hinweise.push(`Zementiert angenommen: das Zementieren ist in der Kronenposition enthalten. ${welches}.`);
	} else if (auftrag.abutment) hinweise.push(auftrag.abutment === "keramik" ? "Keramikabutment angenommen (BEB 6906 auf Ti-Base)." : auftrag.abutment === "individuell" ? "Individuelles Abutment angenommen (BEB 2033 auf Ti-Base)." : "Konfektioniertes Abutment angenommen (BEB 4421).");
	if (auftrag.kronenart === "galvano") hinweise.push("Galvano angenommen: die Laborliste hat keine eigene Galvanoposition. Gerechnet wird die metallische Krone oder das Teleskop in Hochgold.");
	if (auftrag.kronenart === "tabletop") hinweise.push("Tabletop als Teilkrone angenommen (GOZ 2220).");
	const prothese = (t) => t.versorgung === "totalprothese";
	plan.weitere = {
		...plan.weitere,
		interimOK: teile.some((t) => !!t.interim && t.kiefer === "OK" && prothese(t)),
		interimUK: teile.some((t) => !!t.interim && t.kiefer === "UK" && prothese(t)),
		immediatOK: teile.some((t) => !!t.immediat && t.kiefer === "OK" && prothese(t)),
		immediatUK: teile.some((t) => !!t.immediat && t.kiefer === "UK" && prothese(t))
	};
	const geplant = /* @__PURE__ */ new Set();
	for (const t of teile) if (t.kiefer) geplant.add(t.kiefer);
	if (!geplant.size) for (const z of Object.keys(tp)) geplant.add(kieferVon$1(z));
	const regelOpt = {
		...regelOptionen(plan),
		...geplant.size ? { nurKiefer: [...geplant] } : {}
	};
	const regel = therapieAnwenden(regelversorgungErmitteln(plan.zaehne, regelOpt), plan.zaehne, plan);
	let fertig = regelUebernehmen(plan, regel);
	hinweise.push(...regel.hinweise);
	if (auftrag.verblendung) {
		fertig = {
			...fertig,
			zaehne: zaehneFuerVerblendung(fertig, auftrag.verblendung, auftrag.werkstoff),
			einstellungen: {
				...fertig.einstellungen,
				verblendung: auftrag.verblendung
			}
		};
		const regel2 = therapieAnwenden(regelversorgungErmitteln(fertig.zaehne, {
			...regelOptionen(fertig),
			...regelOpt
		}), fertig.zaehne, fertig);
		fertig = regelUebernehmen(fertig, regel2);
		for (const h of regel2.hinweise) if (!hinweise.includes(h)) hinweise.push(h);
	}
	const stufe = auftrag.privatStufe ?? optionen.privatStufe ?? 0;
	if (stufe > 0 && fertig.einstellungen.labor === "praxis") {
		const r = privatStufeAnwenden(fertig, stufe);
		fertig = r.plan;
		hinweise.push(...r.hinweise);
	} else if (stufe > 0) hinweise.push("Die Stufe „Kasse → Privat“ gibt es nur im Eigenlabor – im Fremdlabor nicht angewendet.");
	if (auftrag.werkstoff) {
		const art = WERKSTOFFE$1[auftrag.werkstoff].art;
		const einheiten = kronenEinheiten$1(fertig.positionen);
		const passend = einheiten.filter((e) => WERKSTOFFE_FUER$1[e.art].includes(auftrag.werkstoff));
		fertig.werkstoffe = Object.fromEntries(passend.map((e) => [e.zahn, auftrag.werkstoff]));
		const andere = einheiten.filter((e) => e.art !== art).map((e) => e.zahn);
		if (andere.length) hinweise.push(`${WERKSTOFFE$1[auftrag.werkstoff].kurz} passt nicht zu ${liste(andere)} – dort Standardmaterial angenommen.`);
	}
	return {
		status: "ok",
		plan: fertig,
		auftrag,
		hinweise
	};
}
var goz_2012_default = {
	typ: "goz",
	name: "GOZ Gebührenverzeichnis (Anlage 1, Stand 2012)",
	gueltigAb: "2012-01-01",
	punktwert: .0562421,
	quelle: "https://www.gesetze-im-internet.de/goz_1987/anlage_1.html",
	eintraege: [
		{
			"nr": "0010",
			"text": "Eingehende Untersuchung zur Feststellung von Zahn-, Mund- und Kiefererkrankungen einschließlich Erhebung des Parodontalbefundes sowie Aufzeichnung des Befundes",
			"hinweis": "",
			"punkte": 100,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0030",
			"text": "Aufstellung eines schriftlichen Heil- und Kostenplans nach Befundaufnahme und gegebenenfalls Auswertung von Modellen",
			"hinweis": "",
			"punkte": 200,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0040",
			"text": "Aufstellung eines schriftlichen Heil- und Kostenplans bei kieferorthopädischer Behandlung oder bei funktionsanalytischen und funktionstherapeutischen Maßnahmen nach Befundaufnahme und Ausarbeitung einer Behandlungsplanung",
			"hinweis": "Die Leistungen nach den Nummern 0030 und 0040 sind nicht nebeneinander berechnungsfähig.",
			"punkte": 250,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0050",
			"text": "Abformung oder Teilabformung eines Kiefers für ein Situationsmodell einschließlich Auswertung zur Diagnose oder Planung",
			"hinweis": "",
			"punkte": 120,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0060",
			"text": "Abformung beider Kiefer für Situationsmodelle und einfache Bissfixierung einschließlich Auswertung zur Diagnose oder Planung",
			"hinweis": "Die Nebeneinanderberechnung der Leistungen nach den Nummern 0050 und 0060 ist in der Rechnung zu begründen.",
			"punkte": 260,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0065",
			"text": "Optisch-elektronische Abformung einschließlich vorbereitender Maßnahmen, einfache digitale Bissregistrierung und Archivierung, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Neben der Leistung nach der Nummer 0065 sind konventionelle Abformungen nach diesem Gebührenverzeichnis für dieselbe Kieferhälfte oder denselben Frontzahnbereich nicht berechnungsfähig.",
			"punkte": 80,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0070",
			"text": "Vitalitätsprüfung eines Zahnes oder mehrerer Zähne einschließlich Vergleichstest, je Sitzung",
			"hinweis": "",
			"punkte": 50,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0080",
			"text": "Intraorale Oberflächenanästhesie, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 30,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0090",
			"text": "Intraorale Infiltrationsanästhesie",
			"hinweis": "",
			"punkte": 60,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0100",
			"text": "Intraorale Leitungsanästhesie",
			"hinweis": "Wird die Leistung nach der Nummer 0090 je Zahn mehr als einmal berechnet, ist dies in der Rechnung zu begründen.Bei den Leistungen nach den Nummern 0090 und 0100 sind die Kosten der verwendeten Anästhetika gesondert berechnungsfähig.",
			"punkte": 70,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "0110",
			"text": "Zuschlag für die Anwendung eines Operationsmikroskops bei den Leistungen nach den Nummern 2195, 2330, 2340, 2360, 2410, 2440, 3020, 3030, 3040, 3045, 3060, 3110, 3120, 3190, 3200, 4090, 4100, 4130, 4133, 9100, 9110, 9120, 9130 und 9170Der Zuschlag nach der Nummer 0110 ist je Behandlungstag nur einmal und nur mit dem einfachen Gebührensatz berechnungsfähig.",
			"hinweis": "",
			"punkte": 400,
			"abschnitt": "A Allgemeine Leistungen"
		},
		{
			"nr": "1000",
			"text": "Erstellung eines Mundhygienestatus und eingehende Unterweisung zur Vorbeugung gegen Karies und parodontale Erkrankungen, Dauer mindestens 25 Minuten",
			"hinweis": "",
			"punkte": 200,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "1010",
			"text": "Kontrolle des Übungserfolges einschließlich weiterer Unterweisung, Dauer mindestens 15 Minuten",
			"hinweis": "",
			"punkte": 100,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "1020",
			"text": "Lokale Fluoridierung zur Verbesserung der Zahnhartsubstanz, zur Kariesvorbeugung und -behandlung, mit Lack oder Gel, je Sitzung",
			"hinweis": "Die Leistung nach der Nummer 1000 ist innerhalb eines Jahres einmal, die Leistung nach der Nummer 1010 innerhalb eines Jahres dreimal berechnungsfähig.Die Leistungen umfassen die Erhebung von Mundhygiene-Indizes, das Anfärben der Zähne, die praktische Unterweisung mit individuellen Übungen und die Motivierung des Patienten.Im Zusammenhang mit den Leistungen nach den Nummern 1000 und 1010 sind Leistungen nach den Nummern 0010, 4000 und 8000 sowie Beratungen und Untersuchungen nach der Gebührenordnung für Ärzte nur dann berechnungsfähig, wenn diese Leistungen anderen Zwecken dienen und dies in der Rechnung begründet wird.Die Leistung nach der Nummer 1020 ist innerhalb eines Jahres höchstens viermal berechnungsfähig.",
			"punkte": 50,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "1030",
			"text": "Lokale Anwendung von Medikamenten zur Kariesvorbeugung oder initialen Kariesbehandlung mit einer individuell gefertigten Schiene als Medikamententräger, je Kiefer",
			"hinweis": "1. Die Herstellung einer individuell angefertigten Schiene als Medikamententräger (z. B. Tiefziehschiene) ist gesondert berechnungsfähig.2. Mit der Gebühr sind die Kosten für das verwendete Medikament abgegolten.3. Die Anwendung eines konfektionierten Löffels als Medikamententräger erfüllt nicht den Inhalt der Leistung nach der Nummer 1030.4. Bei Anwendung einer individuell gefertigten Schiene als Medikamententräger für Fluoridierungsmittel ist die mehr als viermalige Berechnung der Leistung nach der Nummer 1030 innerhalb eines Jahres in der Rechnung zu begründen.",
			"punkte": 90,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "1040",
			"text": "Professionelle Zahnreinigung",
			"hinweis": "Die Leistung umfasst das Entfernen der supragingivalen/gingivalen Beläge auf Zahn- und Wurzeloberflächen einschließlich Reinigung der Zahnzwischenräume, das Entfernen des Biofilms, die Oberflächenpolitur und geeignete Fluoridierungsmaßnahmen, je Zahn oder Implantat oder Brückenglied.Die Leistung nach der Nummer 1040 ist neben den Leistungen nach den Nummern 1020, 4050, 4055, 4060, 4070, 4075, 4090 und 4100 nicht berechnungsfähig.",
			"punkte": 28,
			"abschnitt": "B Prophylaxe"
		},
		{
			"nr": "2000",
			"text": "Versiegelung von kariesfreien Zahnfissuren mit aushärtenden Kunststoffen, auch Glattflächenversiegelung, je Zahn",
			"hinweis": "",
			"punkte": 90,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2010",
			"text": "Behandlung überempfindlicher Zahnflächen, je Kiefer",
			"hinweis": "",
			"punkte": 50,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2020",
			"text": "Temporärer speicheldichter Verschluss einer Kavität",
			"hinweis": "",
			"punkte": 98,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2030",
			"text": "Besondere Maßnahmen beim Präparieren oder Füllen von Kavitäten (z. B. Separieren, Beseitigen störenden Zahnfleisches, Stillung einer übermäßigen Papillenblutung), je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Die Leistung nach der Nummer 2030 ist je Sitzung für eine Kieferhälfte oder einen Frontzahnbereich höchstens einmal für besondere Maßnahmen beim Präparieren und höchstens einmal für besondere Maßnahmen beim Füllen von Kavitäten berechnungsfähig.",
			"punkte": 65,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2040",
			"text": "Anlegen von Spanngummi, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 65,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2050",
			"text": "Präparieren einer Kavität und Restauration mit plastischem Füllungsmaterial einschließlich Unterfüllung, Anlegen einer Matrize oder Benutzen anderer Hilfsmittel zur Formung der Füllung, einflächig",
			"hinweis": "",
			"punkte": 213,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2060",
			"text": "Präparieren einer Kavität und Restauration mit Kompositmaterialien, in Adhäsivtechnik (Konditionieren), einflächig, gegebenenfalls einschließlich Mehrschichttechnik, einschließlich Polieren, gegebenenfalls einschließlich Verwendung von Inserts",
			"hinweis": "",
			"punkte": 527,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2070",
			"text": "Präparieren einer Kavität und Restauration mit plastischem Füllungsmaterial einschließlich Unterfüllung, Anlegen einer Matrize oder Benutzen anderer Hilfsmittel zur Formung der Füllung, zweiflächig",
			"hinweis": "",
			"punkte": 242,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2080",
			"text": "Präparieren einer Kavität und Restauration mit Kompositmaterialien, in Adhäsivtechnik (Konditionieren), zweiflächig, gegebenenfalls einschließlich Mehrschichttechnik, einschließlich Polieren, gegebenenfalls einschließlich Verwendung von Inserts",
			"hinweis": "",
			"punkte": 556,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2090",
			"text": "Präparieren einer Kavität und Restauration mit plastischem Füllungsmaterial einschließlich Unterfüllung, Anlegen einer Matrize oder Benutzen anderer Hilfsmittel zur Formung der Füllung, dreiflächig",
			"hinweis": "",
			"punkte": 297,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2100",
			"text": "Präparieren einer Kavität und Restauration mit Kompositmaterialien, in Adhäsivtechnik (Konditionieren), dreiflächig, gegebenenfalls einschließlich Mehrschichttechnik, einschließlich Polieren, gegebenenfalls einschließlich Verwendung von Inserts",
			"hinweis": "",
			"punkte": 642,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2110",
			"text": "Präparieren einer Kavität und Restauration mit plastischem Füllungsmaterial einschließlich Unterfüllung, Anlegen einer Matrize oder Benutzen anderer Hilfsmittel zur Formung der Füllung, mehr als dreiflächig",
			"hinweis": "",
			"punkte": 319,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2120",
			"text": "Präparieren einer Kavität und Restauration mit Kompositmaterialien, in Adhäsivtechnik (Konditionieren), mehr als dreiflächig, gegebenenfalls einschließlich Mehrschichttechnik, einschließlich Polieren, gegebenenfalls einschließlich Verwendung von Inserts",
			"hinweis": "",
			"punkte": 770,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2130",
			"text": "Kontrolle, Finieren/Polieren einer Restauration in separater Sitzung, auch Nachpolieren einer vorhandenen Restauration",
			"hinweis": "",
			"punkte": 104,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2150",
			"text": "Einlagefüllung, einflächig",
			"hinweis": "",
			"punkte": 1141,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2160",
			"text": "Einlagefüllung, zweiflächig",
			"hinweis": "",
			"punkte": 1356,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2170",
			"text": "Einlagefüllung, mehr als zweiflächig",
			"hinweis": "",
			"punkte": 1709,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2180",
			"text": "Vorbereitung eines zerstörten Zahnes mit plastischem Aufbaumaterial zur Aufnahme einer Krone",
			"hinweis": "",
			"punkte": 150,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2190",
			"text": "Vorbereitung eines zerstörten Zahnes durch gegossenen Aufbau mit Stiftverankerung zur Aufnahme einer Krone",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2195",
			"text": "Vorbereitung eines zerstörten Zahnes durch einen Schraubenaufbau oder Glasfaserstift o. Ä. zur Aufnahme einer Krone",
			"hinweis": "Die Leistungen nach den Nummern 2180, 2190 oder 2195 sind neben den Leistungen nach den Nummern 2150 bis 2170 nicht berechnungsfähig.Die Leistung nach der Nummer 2180 ist neben der Leistung nach der Nummer 2190 nicht berechnungsfähig.Die Leistung nach der Nummer 2195 ist neben der Leistung nach der Nummer 2180 berechnungsfähig.Die Leistungen nach den Nummern 2180, 2190 und/oder die Leistung nach der Nummer 2195 ist je Zahn nur jeweils einmal berechnungsfähig.Die Kosten für die Verankerungselemente sind gesondert berechnungsfähig.",
			"punkte": 300,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2197",
			"text": "Adhäsive Befestigung (plastischer Aufbau, Stift, Inlay, Krone, Teilkrone, Veneer etc.)",
			"hinweis": "",
			"punkte": 130,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2200",
			"text": "Versorgung eines Zahnes oder Implantats durch eine Vollkrone (Tangentialpräparation)",
			"hinweis": "",
			"punkte": 1322,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2210",
			"text": "Versorgung eines Zahnes durch eine Vollkrone (Hohlkehl- oder Stufenpräparation)",
			"hinweis": "",
			"punkte": 1678,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2220",
			"text": "Versorgung eines Zahnes durch eine Teilkrone mit Retentionsrillen oder -kästen oder mit Pinledges einschließlich Rekonstruktion der gesamten Kaufläche, auch Versorgung eines Zahnes durch ein Veneer",
			"hinweis": "Neben den Leistungen nach den Nummern 2200 bis 2220 sind die Leistungen nach den Nummern 2050 bis 2130 nicht berechnungsfähig.Die Leistung nach der Nummer 2210 ist im Zusammenhang mit Implantaten nicht berechnungsfähig.Durch die Leistungen nach den Nummern 2150 bis 2170 und 2200 bis 2220 sind folgende zahnärztliche Leistungen abgegolten: Präparieren des Zahnes oder Implantats, Relationsbestimmung, Abformungen, Einproben, provisorisches Eingliedern, festes Einfügen der Einlagefüllung oder der Krone oder der Teilkrone oder des Veneers, Nachkontrolle und Korrekturen.Die Leistung nach der Nummer 2200 umfasst auch die Verschraubung und Abdeckung mit Füllungsmaterial.Zu den Kronen nach den Nummern 2200 bis 2220 gehören Kronen (Voll- und Teilkronen) jeder zahntechnischen Ausführung.",
			"punkte": 2067,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2250",
			"text": "Eingliederung einer konfektionierten Krone in der pädiatrischen Zahnheilkunde",
			"hinweis": "Die Kosten für konfektionierte Kronen sind gesondert berechnungsfähig.",
			"punkte": 210,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2260",
			"text": "Provisorium im direkten Verfahren ohne Abformung, je Zahn oder Implantat, einschließlich Entfernung",
			"hinweis": "",
			"punkte": 100,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2270",
			"text": "Provisorium im direkten Verfahren mit Abformung, je Zahn oder Implantat, einschließlich Entfernung",
			"hinweis": "Bei Verwendung eines konfektionierten Provisoriums sind die Kosten hierfür gesondert berechnungsfähig.Das Wiedereingliedern desselben Provisoriums, gegebenenfalls auch mehrmals, einschließlich Entfernung, ist mit der Gebühr nach der Nummer 2260 oder 2270 abgegolten.",
			"punkte": 270,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2290",
			"text": "Entfernung einer Einlagefüllung, einer Krone, eines Brückenankers, Abtrennen eines Brückengliedes oder Steges oder Ähnliches",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2300",
			"text": "Entfernung eines Wurzelstiftes",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2310",
			"text": "Wiedereingliederung einer Einlagefüllung, einer Teilkrone, eines Veneers oder einer Krone oder Wiederherstellung einer Verblendschale an herausnehmbarem Zahnersatz",
			"hinweis": "",
			"punkte": 145,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2320",
			"text": "Wiederherstellung einer Krone, einer Teilkrone, eines Veneers, eines Brückenankers, einer Verblendschale oder einer Verblendung an festsitzendem Zahnersatz, gegebenenfalls einschließlich Wiedereingliederung und Abformung",
			"hinweis": "",
			"punkte": 350,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2330",
			"text": "Maßnahmen zur Erhaltung der vitalen Pulpa bei Caries profunda (Exkavieren, indirekte Überkappung), je Kavität",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2340",
			"text": "Maßnahmen zur Erhaltung der freiliegenden vitalen Pulpa (Exkavieren, direkte Überkappung), je Kavität",
			"hinweis": "",
			"punkte": 200,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2350",
			"text": "Amputation und Versorgung der vitalen Pulpa einschließlich Exkavieren",
			"hinweis": "",
			"punkte": 290,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2360",
			"text": "Exstirpation der vitalen Pulpa einschließlich Exkavieren, je Kanal",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2380",
			"text": "Amputation und endgültige Versorgung der avitalen Milchzahnpulpa",
			"hinweis": "",
			"punkte": 160,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2390",
			"text": "Trepanation eines Zahnes, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 65,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2400",
			"text": "Elektrometrische Längenbestimmung eines Wurzelkanals",
			"hinweis": "Die Leistung nach der Nummer 2400 ist je Wurzelkanal höchstens zweimal je Sitzung berechnungsfähig.",
			"punkte": 70,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2410",
			"text": "Aufbereitung eines Wurzelkanals auch retrograd, je Kanal, gegebenenfalls in mehreren Sitzungen",
			"hinweis": "Die Leistung nach der Nummer 2410 ist für denselben Wurzelkanal nur dann erneut berechnungsfähig, wenn der Wurzelkanal nach der ersten Aufbereitung definitiv versorgt worden ist.Wenn auf Grund anatomischer Besonderheiten eine Aufbereitung in einer Sitzung nicht erfolgen kann, ist die Leistung nach der Nummer 2410 für denselben Wurzelkanal erneut berechnungsfähig. Dies ist in der Rechnung zu begründen. Je Aufbereitung eines Wurzelkanals ist die Leistung in diesem Fall höchstens zweimal berechnungsfähig.",
			"punkte": 392,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2420",
			"text": "Zusätzliche Anwendung elektrophysikalisch-chemischer Methoden, je Kanal",
			"hinweis": "",
			"punkte": 70,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2430",
			"text": "Medikamentöse Einlage in Verbindung mit Maßnahmen nach den Nummern 2360, 2380 und 2410, je Zahn und Sitzung",
			"hinweis": "",
			"punkte": 204,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "2440",
			"text": "Füllung eines Wurzelkanals",
			"hinweis": "",
			"punkte": 258,
			"abschnitt": "C Konservierende Leistungen"
		},
		{
			"nr": "3000",
			"text": "Entfernung eines einwurzeligen Zahnes oder eines enossalen Implantats",
			"hinweis": "",
			"punkte": 70,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3010",
			"text": "Entfernung eines mehrwurzeligen Zahnes",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3020",
			"text": "Entfernung eines tief frakturierten oder tief zerstörten Zahnes",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3030",
			"text": "Entfernung eines Zahnes oder eines enossalen Implantats durch Osteotomie",
			"hinweis": "",
			"punkte": 350,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3040",
			"text": "Entfernung eines retinierten, impaktierten oder verlagerten Zahnes durch Osteotomie",
			"hinweis": "",
			"punkte": 540,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3045",
			"text": "Entfernen eines extrem verlagerten und/oder extrem retinierten Zahnes durch umfangreiche Osteotomie bei gefährdeten anatomischen Nachbarstrukturen",
			"hinweis": "",
			"punkte": 767,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3050",
			"text": "Stillung einer übermäßigen Blutung im Mund- und/oder Kieferbereich, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3060",
			"text": "Stillung einer Blutung durch Abbinden oder Umstechen des Gefäßes oder durch Knochenbolzung",
			"hinweis": "",
			"punkte": 140,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3070",
			"text": "Exzision von Schleimhaut oder Granulationsgewebe, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 45,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3080",
			"text": "Exzision einer Schleimhautwucherung größeren Umfangs (z. B. lappiges Fibrom, Epulis)",
			"hinweis": "",
			"punkte": 150,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3090",
			"text": "Plastischer Verschluss einer eröffneten Kieferhöhle",
			"hinweis": "",
			"punkte": 370,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3100",
			"text": "Plastische Deckung im Rahmen einer Wundversorgung einschließlich einer Periostschlitzung, je Operationsgebiet (Raum einer zusammenhängenden Schnittführung)",
			"hinweis": "Die Leistung nach der Nummer 3100 ist für dasselbe Operationsgebiet nicht neben der Leistung nach der Nummer 3090 berechnungsfähig.",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3110",
			"text": "Resektion einer Wurzelspitze an einem Frontzahn",
			"hinweis": "",
			"punkte": 460,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3120",
			"text": "Resektion einer Wurzelspitze an einem Seitenzahn",
			"hinweis": "Die Kosten für konfektionierte apikale Stiftsysteme sind gesondert berechnungsfähig.",
			"punkte": 580,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3130",
			"text": "Hemisektion und Teilextraktion eines mehrwurzeligen Zahnes",
			"hinweis": "",
			"punkte": 280,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3140",
			"text": "Reimplantation eines Zahnes einschließlich einfacher Fixation",
			"hinweis": "",
			"punkte": 550,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3160",
			"text": "Transplantation eines Zahnes einschließlich operativer Schaffung des Knochenbettes",
			"hinweis": "",
			"punkte": 650,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3190",
			"text": "Operation einer Zyste durch Zystektomie in Verbindung mit einer Osteotomie oder Wurzelspitzenresektion",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3200",
			"text": "Operation einer Zyste durch Zystektomie, als selbstständige Leistung",
			"hinweis": "Das Auskratzen von Granulationsgewebe oder kleinen Zysten in Verbindung mit Extraktionen, Osteotomien oder Wurzelspitzenresektionen kann nicht nach den Nummern 3190 bis 3200 sowie 3310 berechnet werden.",
			"punkte": 500,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3210",
			"text": "Beseitigung störender Schleimhautbänder, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 140,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3230",
			"text": "Knochenresektion am Alveolarfortsatz zur Formung des Prothesenlagers, als selbstständige Leistung, je Kiefer",
			"hinweis": "",
			"punkte": 440,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3240",
			"text": "Vestibulumplastik oder Mundbodenplastik kleineren Umfangs auch Gingivaextensionsplastik, je Kieferhälfte oder Frontzahnbereich, für einen Bereich bis zu zwei nebeneinander liegenden Zähnen, gegebenenfalls auch am zahnlosen Kieferabschnitt",
			"hinweis": "",
			"punkte": 550,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3250",
			"text": "Tuberplastik, einseitig",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3260",
			"text": "Freilegen eines retinierten oder verlagerten Zahnes zur orthopädischen Einstellung",
			"hinweis": "",
			"punkte": 550,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3270",
			"text": "Germektomie",
			"hinweis": "",
			"punkte": 590,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3280",
			"text": "Lösen, Verlegen und Fixieren des Lippenbändchens und Durchtrennen des Septums bei echtem Diastema",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3290",
			"text": "Kontrolle nach chirurgischem Eingriff, als selbstständige Leistung, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 55,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3300",
			"text": "Nachbehandlung nach chirurgischem Eingriff (z. B. Tamponieren), als selbstständige Leistung, je Operationsgebiet (Raum einer zusammenhängenden Schnittführung)",
			"hinweis": "Die Leistung nach der Nummer 3300 ist höchstens zweimal je Kieferhälfte oder Frontzahnbereich berechnungsfähig.Neben der Leistung nach der Nummer 3300 sind die Leistungen nach den Nummern 3060 oder 3310 nicht berechnungsfähig.",
			"punkte": 65,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "3310",
			"text": "Chirurgische Wundrevision (z. B. Glätten des Knochens, Auskratzen, Naht), je Operationsgebiet (Raum einer zusammenhängenden Schnittführung)",
			"hinweis": "Die Leistung nach der Nummer 3310 ist höchstens zweimal je Kieferhälfte oder Frontzahnbereich berechnungsfähig.Neben der Leistung nach der Nummer 3310 sind die Leistungen nach den Nummern 3060 oder 3300 nicht berechnungsfähig.",
			"punkte": 100,
			"abschnitt": "D Chirurgie"
		},
		{
			"nr": "4000",
			"text": "Erstellen und Dokumentieren eines Parodontalstatus",
			"hinweis": "Die Leistung nach der Nummer 4000 ist innerhalb eines Jahres höchstens zweimal berechnungsfähig.",
			"punkte": 160,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4005",
			"text": "Erhebung mindestens eines Gingivalindex und/oder eines Parodontalindex (z. B. des Parodontalen Screening-Index PSI)",
			"hinweis": "Die Leistung nach der Nummer 4005 ist innerhalb eines Jahres höchstens zweimal berechnungsfähig.",
			"punkte": 80,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4020",
			"text": "Lokalbehandlung von Mundschleimhauterkrankungen, gegebenenfalls einschließlich Taschenspülungen, je Sitzung",
			"hinweis": "",
			"punkte": 45,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4025",
			"text": "Subgingivale medikamentöse antibakterielle Lokalapplikation, je Zahn",
			"hinweis": "Die verwendeten antibakteriellen Materialien sind gesondert berechnungsfähig.",
			"punkte": 15,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4030",
			"text": "Beseitigung von scharfen Zahnkanten, störenden Prothesenrändern und Fremdreizen am Parodontium, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 35,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4040",
			"text": "Beseitigung grober Vorkontakte der Okklusion und Artikulation durch Einschleifen des natürlichen Gebisses oder bereits vorhandenen Zahnersatzes, je Sitzung",
			"hinweis": "",
			"punkte": 45,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4050",
			"text": "Entfernung harter und weicher Zahnbeläge, gegebenenfalls einschließlich Polieren an einem einwurzeligen Zahn oder Implantat, auch Brückenglied",
			"hinweis": "",
			"punkte": 10,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4055",
			"text": "Entfernung harter und weicher Zahnbeläge, gegebenenfalls einschließlich Polieren an einem mehrwurzeligen Zahn",
			"hinweis": "Die Leistungen nach den Nummern 4050 und 4055 sind für denselben Zahn innerhalb von 30 Tagen nur einmal berechnungsfähig.",
			"punkte": 13,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4060",
			"text": "Kontrolle nach Entfernung harter und weicher Zahnbeläge oder professioneller Zahnreinigung nach der Nummer 1040 mit Nachreinigung einschließlich Polieren, je Zahn, oder Implantat, auch Brückenglied",
			"hinweis": "Die Leistung nach der Nummer 4060 ist neben den Leistungen nach den Nummern 1040, 4050 und 4055 nicht berechnungsfähig.",
			"punkte": 7,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4070",
			"text": "Parodontalchirurgische Therapie (insbesondere Entfernung subgingivaler Konkremente und Wurzelglättung) an einem einwurzeligen Zahn oder Implantat, geschlossenes Vorgehen",
			"hinweis": "",
			"punkte": 100,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4075",
			"text": "Parodontalchirurgische Therapie (insbesondere Entfernung subgingivaler Konkremente und Wurzelglättung) an einem mehrwurzeligen Zahn, geschlossenes Vorgehen",
			"hinweis": "",
			"punkte": 130,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4080",
			"text": "Gingivektomie, Gingivoplastik, je Parodontium",
			"hinweis": "",
			"punkte": 45,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4090",
			"text": "Lappenoperation, offene Kürettage einschließlich Osteoplastik an einem Frontzahn, je Parodontium",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4100",
			"text": "Lappenoperation, offene Kürettage einschließlich Osteoplastik an einem Seitenzahn, je Parodontium",
			"hinweis": "Neben den Leistungen nach den Nummern 4090 und 4100 sind Leistungen nach den Nummern 4050 bis 4080 in der gleichen Sitzung nicht berechnungsfähig.",
			"punkte": 275,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4110",
			"text": "Auffüllen von parodontalen Knochendefekten mit Aufbaumaterial (Knochen- und/oder Knochenersatzmaterial), auch Einbringen von Proteinen, zur regenerativen Behandlung parodontaler Defekte, gegebenenfalls einschließlich Materialentnahme im Aufbaugebiet, je Zahn oder Parodontium oder Implantat",
			"hinweis": "Die Leistung nach der Nummer 4110 ist auch im Rahmen einer chirurgischen Behandlung berechnungsfähig.Die Kosten eines einmal verwendbaren Knochenkollektors oder -schabers sind gesondert berechnungsfähig.",
			"punkte": 180,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4120",
			"text": "Verlegen eines gestielten Schleimhautlappens, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 275,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4130",
			"text": "Gewinnung und Transplantation von Schleimhaut, gegebenenfalls einschließlich Versorgung der Entnahmestelle, je Transplantat",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4133",
			"text": "Gewinnung und Transplantation von Bindegewebe einschließlich Versorgung der Entnahmestelle, je Zahnzwischenraum",
			"hinweis": "",
			"punkte": 880,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4136",
			"text": "Osteoplastik auch Kronenverlängerung, Tunnelierung oder Ähnliches je Zahn oder Parodontium, auch Implantat, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 200,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4138",
			"text": "Verwendung einer Membran zur Behandlung eines Knochendefektes einschließlich Fixierung, je Zahn, je Implantat",
			"hinweis": "",
			"punkte": 220,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "4150",
			"text": "Kontrolle/Nachbehandlung nach parodontalchirurgischen Maßnahmen, je Zahn, Implantat oder Parodontium",
			"hinweis": "",
			"punkte": 7,
			"abschnitt": "E Parodontium"
		},
		{
			"nr": "5000",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn oder Implantat als Brücken- oder Prothesenanker mit einer Vollkrone (Tangentialpräparation)",
			"hinweis": "",
			"punkte": 1016,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5010",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn als Brücken- oder Prothesenanker mit einer Vollkrone (Hohlkehl- und Stufenpräparation) oder Einlagefüllung",
			"hinweis": "",
			"punkte": 1483,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5020",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn als Brücken- oder Prothesenanker mit einer Teilkrone mit Retentionsrillen oder -kasten oder mit Pinledges einschließlich Rekonstruktion der Kaufläche",
			"hinweis": "",
			"punkte": 1997,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5030",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn oder Implantat als Brücken- oder Prothesenanker mit einer Wurzelkappe mit Stift, gegebenenfalls zur Aufnahme einer Verbindungsvorrichtung oder anderer Verbindungselemente",
			"hinweis": "",
			"punkte": 1483,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5040",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: je Pfeilerzahn oder Implantat als Brücken- oder Prothesenanker mit einer Teleskopkrone, auch Konuskrone",
			"hinweis": "Die Leistung nach der Nummer 5040 ist neben der Leistung nach der Nummer 5080 nicht berechnungsfähig.Durch die Leistungen nach den Nummern 5000 bis 5040 sind folgende zahnärztliche Leistungen abgegolten: Präparieren des Zahnes oder Implantats, Relationsbestimmung, Abformungen, Einproben, provisorisches Eingliedern, festes Einfügen der Krone, der Einlagefüllung, der Teilkrone o. a., Nachkontrolle und KorrekturenDie Leistungen nach den Nummern 5000 und 5030 umfassen auch die Verschraubung und Abdeckung mit Füllungsmaterial.Zu den Leistungen nach den Nummern 5000 bis 5040 gehören Brücken- oder Prothesenanker mit Verbindungselementen jeder Ausführung.Die Leistungen nach den Nummern 5010 und 5020 sind im Zusammenhang mit Implantaten nicht berechnungsfähig.Zu den Kronen nach den Nummern 5000 bis 5040 gehören Kronen (Voll-, Teil- und Teleskopkronen, sowie Wurzelstiftkappen) jeder zahntechnischen Ausführung.",
			"punkte": 2605,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5070",
			"text": "Versorgung eines Lückengebisses durch eine Brücke oder Prothese: Verbindung von Kronen oder Einlagefüllungen durch Brückenglieder, Prothesenspannen oder Stege, je zu überbrückende Spanne oder Freiendsattel",
			"hinweis": "",
			"punkte": 400,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5080",
			"text": "Versorgung eines Lückengebisses durch eine zusammengesetzte Brücke oder Prothese, je Verbindungselement",
			"hinweis": "Matrize und Patrize gelten als ein Verbindungselement. Die Leistung nach der Nummer 5080 ist neben der Leistung nach der Nummer 5040 nicht berechnungsfähig.",
			"punkte": 230,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5090",
			"text": "Wiederherstellung der Funktion eines Verbindungselements nach der Nummer 5080",
			"hinweis": "",
			"punkte": 110,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5100",
			"text": "Erneuern des Sekundärteils einer Teleskopkrone einschließlich Abformung",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5110",
			"text": "Wiedereingliederung einer endgültigen Brücke nach Wiederherstellung der Funktion",
			"hinweis": "",
			"punkte": 360,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5120",
			"text": "Provisorische Brücke im direkten Verfahren mit Abformung, je Zahn oder Implantat, einschließlich Entfernung",
			"hinweis": "",
			"punkte": 240,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5140",
			"text": "Provisorische Brücke im direkten Verfahren mit Abformung, je Brückenspanne oder Freiendsattel, einschließlich Entfernung",
			"hinweis": "Das Wiedereingliedern derselben provisorischen Brücke, gegebenenfalls auch mehrmals, einschließlich Entfernung ist mit den Gebühren nach den Nummern 5120 bis 5140 abgegolten.",
			"punkte": 80,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5150",
			"text": "Versorgung eines Lückengebisses mit Hilfe einer durch Adhäsivtechnik befestigten Brücke, für die erste zu überbrückende Spanne",
			"hinweis": "",
			"punkte": 730,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5160",
			"text": "Versorgung eines Lückengebisses nach der Nummer 5150, für jede weitere zu überbrückende Spanne",
			"hinweis": "",
			"punkte": 360,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5170",
			"text": "Anatomische Abformung des Kiefers mit individuellem Löffel bei ungünstigen Zahnbogen- und Kieferformen und/oder tief ansetzenden Bändern oder spezielle Abformung zur Remontage, je Kiefer",
			"hinweis": "",
			"punkte": 250,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5180",
			"text": "Funktionelle Abformung des Oberkiefers mit individuellem Löffel",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5190",
			"text": "Funktionelle Abformung des Unterkiefers mit individuellem Löffel",
			"hinweis": "",
			"punkte": 540,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5200",
			"text": "Versorgung eines teilbezahnten Kiefers durch eine Teilprothese mit einfachen, gebogenen Haftelementen einschließlich Einschleifen der Auflagen",
			"hinweis": "",
			"punkte": 700,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5210",
			"text": "Versorgung eines teilbezahnten Kiefers durch eine Modellgussprothese mit gegossenen Halte- und Stützelementen einschließlich Einschleifen der Auflagen",
			"hinweis": "",
			"punkte": 1400,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5220",
			"text": "Versorgung eines zahnlosen Kiefers durch eine totale Prothese oder Deckprothese bei Verwendung einer Kunststoff- oder Metallbasis, im Oberkiefer",
			"hinweis": "Eine Deckprothese setzt eine Basisgestaltung wie bei einer totalen Prothese voraus.",
			"punkte": 1850,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5230",
			"text": "Versorgung eines zahnlosen Kiefers durch eine totale Prothese oder Deckprothese bei Verwendung einer Kunststoff- oder Metallbasis, im Unterkiefer",
			"hinweis": "Eine Deckprothese setzt eine Basisgestaltung wie bei einer totalen Prothese voraus.Durch die Leistungen nach den Nummern 5200 bis 5230 sind folgende Leistungen abgegolten:Anatomische Abformungen (auch des Gegenkiefers), Bestimmung der Kieferrelation, Einproben, Einpassen bzw. Einfügen, Nachkontrolle und Korrekturen.",
			"punkte": 2200,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5250",
			"text": "Maßnahmen zur Wiederherstellung der Funktion oder zur Erweiterung einer abnehmbaren Prothese (ohne Abformung)",
			"hinweis": "",
			"punkte": 140,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5260",
			"text": "Maßnahmen zur Wiederherstellung der Funktion oder zur Erweiterung einer abnehmbaren Prothese (mit Abformung) einschließlich Halte- und Stützvorrichtungen",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5270",
			"text": "Teilunterfütterung einer Prothese",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5280",
			"text": "Vollständige Unterfütterung einer Prothese",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5290",
			"text": "Vollständige Unterfütterung einer Prothese einschließlich funktioneller Randgestaltung, im Oberkiefer",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5300",
			"text": "Vollständige Unterfütterung einer Prothese einschließlich funktioneller Randgestaltung, im Unterkiefer",
			"hinweis": "",
			"punkte": 540,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5310",
			"text": "Vollständige Unterfütterung bei einer Defektprothese einschließlich funktioneller Randgestaltung",
			"hinweis": "Im Zusammenhang mit Leistungen nach den Nummern 5270 bis 5310 dürfen Leistungen nach den Nummern 5250 und 5260 nur berechnet werden, wenn es sich um zeitlich getrennte Verrichtungen handelt.Leistungen nach den Nummern 5270 bis 5310 sind nur als Maßnahmen zur Wiederherstellung der Funktion einer abnehmbaren Prothese berechnungsfähig.",
			"punkte": 730,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5320",
			"text": "Eingliederung eines Obturators zum Verschluss von Defekten des Gaumens",
			"hinweis": "",
			"punkte": 2200,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5330",
			"text": "Eingliederung einer Resektionsprothese zum Verschluss und zum Ausgleich von Defekten der Kiefer",
			"hinweis": "",
			"punkte": 2800,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "5340",
			"text": "Eingliederung einer Prothese oder Epithese zum Verschluss extraoraler Weichteildefekte oder zum Ersatz fehlender Gesichtsteile einschließlich Stütz-, Halte- oder Hilfsvorrichtungen",
			"hinweis": "Maßnahmen zur Weichteilstützung sind mit den Leistungen nach den Nummern 5200 bis 5340 abgegolten.",
			"punkte": 7300,
			"abschnitt": "F Prothetik"
		},
		{
			"nr": "6000",
			"text": "Profil- oder Enfacefotografie einschließlich kieferorthopädischer Auswertung",
			"hinweis": "Eine mehr als viermalige Berechnung der Leistung nach der Nummer 6000 im Verlauf einer kieferorthopädischen Behandlung ist in der Rechnung zu begründen.",
			"punkte": 80,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6010",
			"text": "Anwendung von Methoden zur Analyse von Kiefermodellen (dreidimensionale, graphische oder metrische Analysen, Diagramme), je Leistung nach der Nummer 0060",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6020",
			"text": "Anwendung von Methoden zur Untersuchung des Gesichtsschädels (zeichnerische Auswertung von Röntgenaufnahmen des Schädels, Wachstumsanalysen)",
			"hinweis": "",
			"punkte": 360,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6030",
			"text": "Maßnahmen zur Umformung eines Kiefers einschließlich Retention, geringer Umfang",
			"hinweis": "",
			"punkte": 1350,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6040",
			"text": "Maßnahmen zur Umformung eines Kiefers einschließlich Retention, mittlerer Umfang",
			"hinweis": "",
			"punkte": 2100,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6050",
			"text": "Maßnahmen zur Umformung eines Kiefers einschließlich Retention, hoher Umfang",
			"hinweis": "Bei Maßnahmen von mittlerem Umfang nach der Nummer 6040 müssen mindestens drei, bei Maßnahmen von hohem Umfang mindestens vier der Kriterien nach den Buchstaben a bis e erfüllt sein:a) Zahl der bewegten Zahngruppen: zwei und mehr Zahngruppen,b) Ausmaß der Zahnbewegung: mehr als 2 Millimeter,c) Art der Zahnbewegung: körperlich mehr als 2 Millimeter, kontrollierte Wurzelbewegung, direkte Veränderung der Bisshöhe, Zahndrehung mehr als 30 Grad,d) Richtung der Zahnbewegung: entgegen Wanderungstendenz,e) Verankerung: mit zusätzlichen intra- oder extraoralen Maßnahmen.",
			"punkte": 3600,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6060",
			"text": "Maßnahmen zur Einstellung der Kiefer in den Regelbiss während der Wachstumsphase einschließlich Retention, geringer Umfang",
			"hinweis": "",
			"punkte": 1800,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6070",
			"text": "Maßnahmen zur Einstellung der Kiefer in den Regelbiss während der Wachstumsphase einschließlich Retention, mittlerer Umfang",
			"hinweis": "",
			"punkte": 2600,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6080",
			"text": "Maßnahmen zur Einstellung der Kiefer in den Regelbiss während der Wachstumsphase einschließlich Retention, hoher Umfang",
			"hinweis": "Bei Maßnahmen von mittlerem Umfang muss mindestens ein Kriterium nach den Buchstaben a bis c, bei Maßnahmen von hohem Umfang müssen mindestens zwei der Kriterien erfüllt sein:a) Ausmaß der Bissverschiebung: mehr als 4 Millimeter,b) Richtung der durchzuführenden Bissverschiebung, Unterkiefer relativ zum Oberkiefer: dorsal,c) Skelettale Bedingungen: ungünstige Wachstumsvoraussetzungen.Die Leistungen nach den Nummern 6030 bis 6080 umfassen alle im Behandlungsplan festgelegten Maßnahmen innerhalb eines Zeitraumes von bis zu vier Jahren.Die Maßnahmen im Sinne der Nummern 6030 bis 6080 umfassen alle Leistungen zur Kieferumformung und Retention bzw. zur Einstellung des Unterkiefers in den Regelbiss innerhalb eines Zeitraumes von bis zu vier Jahren, unabhängig von den angewandten Behandlungsmethoden oder den verwendeten Therapiegeräten.Neben den Leistungen nach den Nummern 6030 bis 6080 sind Leistungen nach den Nummern 6190 bis 6260 nicht berechnungsfähig.",
			"punkte": 3600,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6090",
			"text": "Maßnahmen zur Einstellung der Okklusion durch alveolären Ausgleich bei abgeschlossener Wachstumsphase einschließlich Retention, je Kiefer",
			"hinweis": "",
			"punkte": 700,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6100",
			"text": "Eingliederung eines Klebebrackets zur Aufnahme orthodontischer Hilfsmittel",
			"hinweis": "",
			"punkte": 165,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6110",
			"text": "Entfernung eines Klebebrackets einschließlich Polieren und gegebenenfalls Versiegelung des Zahnes",
			"hinweis": "",
			"punkte": 70,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6120",
			"text": "Eingliederung eines Bandes zur Aufnahme orthodontischer Hilfsmittel",
			"hinweis": "",
			"punkte": 230,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6130",
			"text": "Entfernung eines Bandes einschließlich Polieren und gegebenenfalls Versiegelung des Zahnes",
			"hinweis": "",
			"punkte": 20,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6140",
			"text": "Eingliederung eines Teilbogens",
			"hinweis": "",
			"punkte": 210,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6150",
			"text": "Eingliederung eines ungeteilten Bogens, alle Zahngruppen umfassend, je Kiefer",
			"hinweis": "",
			"punkte": 500,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6160",
			"text": "Eingliederung einer intra-/extraoralen Verankerung (z. B. Headgear).",
			"hinweis": "",
			"punkte": 370,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6170",
			"text": "Eingliederung einer Kopf-Kinn-Kappe.",
			"hinweis": "Die Kosten für die eingegliederten Hilfsmittel nach den Nummern 6160 und 6170 sind gesondert berechnungsfähig.",
			"punkte": 500,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6180",
			"text": "Maßnahmen zur Wiederherstellung der Funktionsfähigkeit und/oder Erweiterung von herausnehmbaren Behandlungsgeräten einschließlich Abformung und Wiedereinfügen, je Kiefer und je Sitzung einmal berechnungsfähig",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6190",
			"text": "Beratendes und belehrendes Gespräch mit Anweisungen zur Beseitigung von schädlichen Gewohnheiten und Dysfunktionen",
			"hinweis": "Neben der Leistung nach der Nummer 6190 ist die Leistung nach der Nummer 0010 in derselben Sitzung nicht berechnungsfähig.",
			"punkte": 140,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6200",
			"text": "Eingliedern von Hilfsmitteln zur Beseitigung von Funktionsstörungen (z. B. Mundvorhofplatte) einschließlich Anweisung zum Gebrauch und Kontrollen",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6210",
			"text": "Kontrolle des Behandlungsverlaufs oder Weiterführung der Retention einschließlich kleiner Änderungen der Behandlungs- oder Retentionsgeräte, Therapiekontrolle der gesteuerten Extraktion, je Sitzung",
			"hinweis": "",
			"punkte": 90,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6220",
			"text": "Vorbereitende Maßnahmen zur Herstellung von kieferorthopädischen Behandlungsmitteln (z. B. Abformung, Bissnahme), je Kiefer",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6230",
			"text": "Eingliederung von kieferorthopädischen Behandlungsmitteln, je Kiefer",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6240",
			"text": "Maßnahmen zur Verhütung von Folgen vorzeitigen Zahnverlustes (Offenhalten einer Lücke)",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6250",
			"text": "Beseitigung des Diastemas, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "6260",
			"text": "Maßnahmen zur Einordnung eines verlagerten Zahnes in den Zahnbogen, als selbstständige Leistung",
			"hinweis": "",
			"punkte": 1100,
			"abschnitt": "G Kieferorthopädie"
		},
		{
			"nr": "7000",
			"text": "Eingliederung eines Aufbissbehelfs ohne adjustierte Oberfläche",
			"hinweis": "",
			"punkte": 270,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7010",
			"text": "Eingliederung eines Aufbissbehelfs mit adjustierter Oberfläche",
			"hinweis": "",
			"punkte": 800,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7020",
			"text": "Umarbeitung einer vorhandenen Prothese zum Aufbissbehelf",
			"hinweis": "",
			"punkte": 450,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7030",
			"text": "Wiederherstellung der Funktion eines Aufbissbehelfs, z. B. durch Unterfütterung",
			"hinweis": "",
			"punkte": 370,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7040",
			"text": "Kontrolle eines Aufbissbehelfs",
			"hinweis": "",
			"punkte": 65,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7050",
			"text": "Kontrolle eines Aufbissbehelfs mit adjustierter Oberfläche: subtraktive Maßnahmen, je Sitzung",
			"hinweis": "",
			"punkte": 180,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7060",
			"text": "Kontrolle eines Aufbissbehelfs mit adjustierter Oberfläche: additive Maßnahmen, je Sitzung",
			"hinweis": "",
			"punkte": 410,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7070",
			"text": "Semipermanente Schiene unter Anwendung der Ätztechnik, je Interdentalraum",
			"hinweis": "",
			"punkte": 90,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7080",
			"text": "Versorgung eines Kiefers mit einem festsitzenden laborgefertigten Provisorium (einschließlich Vorpräparation) im indirekten Verfahren, je Zahn oder je Implantat, einschließlich Entfernung",
			"hinweis": "",
			"punkte": 600,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7090",
			"text": "Versorgung eines Kiefers mit einem laborgefertigten Provisorium im indirekten Verfahren, je Brückenglied, einschließlich Entfernung",
			"hinweis": "Die Berechnung der Leistungen nach den Nummern 7080 und 7090 setzt voraus, dass es sich bei dem festsitzenden laborgefertigten Provisorium um ein Langzeitprovisorium mit einer Tragezeit von mindestens drei Monaten handelt.",
			"punkte": 270,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "7100",
			"text": "Maßnahmen zur Wiederherstellung der Funktion eines Langzeitprovisoriums, je Krone, Spanne oder Freiendbrückenglied",
			"hinweis": "Die Wiedereingliederung desselben festsitzenden laborgefertigten Provisoriums nach den Nummern 7080 oder 7090, gegebenenfalls auch mehrmals, einschließlich Entfernung, ist mit den Gebühren nach den Nummern 7080 bis 7100 abgegolten.",
			"punkte": 200,
			"abschnitt": "H Aufbissbehelfe/Schienen"
		},
		{
			"nr": "8000",
			"text": "Klinische Funktionsanalyse einschließlich Dokumentation",
			"hinweis": "Die Leistung nach der Nummer 8000 umfasst auch folgende zahnärztliche Leistungen: prophylaktische, prothetische, parodontologische und okklusale Befunderhebung, funktionsdiagnostische Auswertung von Röntgenaufnahmen des Schädels und der Halswirbelsäule, klinische Reaktionstests (z. B. Resilienztest, Provokationstest).",
			"punkte": 500,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8010",
			"text": "Registrieren der gelenkbezüglichen Zentrallage des Unterkiefers, auch Stützstiftregistrierung, je Registrat",
			"hinweis": "Die Leistung nach der Nummer 8010 ist je Sitzung höchstens zweimal berechnungsfähig.Neben der Leistung nach der Nummer 8010 sind die Material- und Laborkosten für die Bissnahme und die Lieferung und Anbringung des Stützstiftbestecks gesondert berechnungsfähig.",
			"punkte": 180,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8020",
			"text": "Arbiträre Scharnierachsenbestimmung (eingeschlossen sind die arbiträre Scharnierachsenbestimmung, das Anlegen eines Übertragungsbogens, das Koordinieren eines Übertragungsbogens mit einem Artikulator)",
			"hinweis": "",
			"punkte": 300,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8030",
			"text": "Kinematische Scharnierachsenbestimmung (eingeschlossen sind die kinematische Scharnierachsenbestimmung, das definitive Markieren der Referenzpunkte, das Anlegen eines Übertragungsbogens, das Koordinieren eines Übertragungsbogens mit einem Artikulator)",
			"hinweis": "",
			"punkte": 550,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8035",
			"text": "Kinematische Scharnierachsenbestimmung mittels elektronischer Aufzeichnung (eingeschlossen sind die kinematische Scharnierachsenbestimmung, das definitive Markieren der Referenzpunkte, gegebenenfalls das Anlegen eines Übertragungsbogens, gegebenenfalls das Koordinieren eines Übertragungsbogens mit einem Artikulator)",
			"hinweis": "Neben den Leistungen nach den Nummern 8020 bis 8035 sind die Material- und Laborkosten für die Artikulation des Ober- und Unterkiefermodells im (halb) individuellen Artikulator gesondert berechnungsfähig.",
			"punkte": 550,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8050",
			"text": "Registrieren von Unterkieferbewegungen zur Einstellung halbindividueller Artikulatoren und Einstellung nach den gemessenen Werten, je Sitzung",
			"hinweis": "",
			"punkte": 500,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8060",
			"text": "Registrieren von Unterkieferbewegungen zur Einstellung voll adjustierbarer Artikulatoren und Einstellung nach den gemessenen Werten, je Sitzung",
			"hinweis": "",
			"punkte": 750,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8065",
			"text": "Registrieren von Unterkieferbewegungen mittels elektronischer Aufzeichnung zur Einstellung voll adjustierbarer Artikulatoren und Einstellung nach den gemessenen Werten, je Sitzung",
			"hinweis": "Neben den Leistungen nach den Nummern 8050 bis 8065 sind Material- und Laborkosten für die Einstellung des (halb) individuellen Artikulators nach den gemessenen Werten gesondert berechnungsfähig.",
			"punkte": 850,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8080",
			"text": "Diagnostische Maßnahmen an Modellen im Artikulator einschließlich subtraktiver oder additiver Korrekturen, Befundauswertung und Behandlungsplanung, je Sitzung",
			"hinweis": "",
			"punkte": 250,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8090",
			"text": "Diagnostischer Aufbau von Funktionsflächen am natürlichen Gebiss, am festsitzenden und/oder herausnehmbaren Zahnersatz, je Sitzung",
			"hinweis": "",
			"punkte": 250,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "8100",
			"text": "Systematische subtraktive Maßnahmen am natürlichen Gebiss, am festsitzenden und/oder herausnehmbaren Zahnersatz, je Zahnpaar",
			"hinweis": "",
			"punkte": 20,
			"abschnitt": "J Funktionsanalyse"
		},
		{
			"nr": "9000",
			"text": "Implantatbezogene Analyse und Vermessung des Alveolarfortsatzes, des Kieferkörpers und der angrenzenden knöchernen Strukturen sowie der Schleimhaut, einschließlich metrischer Auswertung von radiologischen Befundunterlagen, Modellen und Fotos zur Feststellung der Implantatposition, gegebenenfalls mit Hilfe einer individuellen Schablone zur Diagnostik, einschließlich Implantatauswahl, je Kiefer.",
			"hinweis": "Bei Verwendung einer Röntgenmessschablone sind die Material- und Laborkosten gesondert berechnungsfähig.",
			"punkte": 884,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9003",
			"text": "Verwenden einer Orientierungsschablone/Positionierungsschablone zur Implantation, je Kiefer",
			"hinweis": "Bei Verwendung einer Orientierungsschablone sind die Material- und Laborkosten gesondert berechnungsfähig.",
			"punkte": 100,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9005",
			"text": "Verwenden einer auf dreidimensionale Daten gestützten Navigationsschablone/chirurgischen Führungsschablone zur Implantation, gegebenenfalls einschließlich Fixierung, je Kiefer",
			"hinweis": "Die verwendeten Fixierungselemente sowie die Material- und Laborkosten der Navigationsschablone sind gesondert berechnungsfähig.",
			"punkte": 300,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9010",
			"text": "Implantatinsertion, je Implantat Präparieren einer Knochenkavität für ein enossales Implantat, Einsetzen einer Implantatschablone zur Überprüfung der Knochenkavität (z. B. Tiefenlehre), gegebenenfalls einschließlich Knochenkondensation, Knochenglättung im Bereich des Implantats, Einbringen eines enossalen Implantats einschließlich Verschlussschraube und gegebenenfalls Einbringen von Aufbauelementen bei offener Einheilung sowie Wundverschluss",
			"hinweis": "",
			"punkte": 1545,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9020",
			"text": "Insertion eines Implantats zum temporären Verbleib, auch orthodontisches Implantat",
			"hinweis": "",
			"punkte": 515,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9040",
			"text": "Freilegen eines Implantats, und Einfügen eines oder mehrerer Aufbauelemente (z. B. eines Gingivaformers) bei einem zweiphasigen Implantatsystem",
			"hinweis": "",
			"punkte": 626,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9050",
			"text": "Entfernen und Wiedereinsetzen sowie Auswechseln eines oder mehrerer Aufbauelemente bei einem zweiphasigen Implantatsystem während der rekonstruktiven Phase",
			"hinweis": "1. Die Leistung nach der Nummer 9050 ist nicht neben den Leistungen nach den Nummern 9010 und 9040 berechnungsfähig.2. Die Leistung nach der Nummer 9050 ist je Implantat höchstens dreimal und höchstens einmal je Sitzung berechnungsfähig.",
			"punkte": 313,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9060",
			"text": "Auswechseln von Aufbauelementen (Sekundärteilen) im Reparaturfall",
			"hinweis": "Die Leistung nach der Nummer 9060 ist für ein Implantat höchstens einmal je Sitzung berechnungsfähig.",
			"punkte": 313,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9090",
			"text": "Knochengewinnung (z. B. Knochenkollektor oder Knochenschaber), Knochenaufbereitung und -implantation, auch zur Weichteilunterfütterung",
			"hinweis": "Die Kosten eines einmal verwendbaren Knochenkollektors oder -schabers sind gesondert berechnungsfähig.",
			"punkte": 400,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9100",
			"text": "Aufbau des Alveolarfortsatzes durch Augmentation ohne zusätzliche Stabilisierungsmaßnahmen, je Kieferhälfte oder Frontzahnbereich Mit der Leistung nach der Nummer 9100 sind folgende Leistungen abgegolten: Lagerbildung, Glättung des Alveolarfortsatzes, gegebenenfalls Entnahme von Knochen innerhalb des Aufbaugebietes, Einbringung von Aufbaumaterial (Knochen und/oder Knochenersatzmaterial) und Wundverschluss mit vollständiger Schleimhautabdeckung, gegebenenfalls einschließlich Einbringung und Fixierung resorbierbarer oder nicht resorbierbarer Barrieren",
			"hinweis": "1. Die Leistung nach der Nummer 9100 ist für die Glättung des Alveolarfortsatzes im Bereich des Implantatbettes nicht berechnungsfähig.2. Neben der Leistung nach der Nummer 9100 sind die Leistungen nach der Nummer 9130 nicht berechnungsfähig.3. Wird die Leistung nach der Nummer 9100 in derselben Kieferhälfte neben der Leistung nach der Nummer 9110 erbracht, ist die Hälfte der Gebühr der Nummer 9100 berechnungsfähig.4. Wird die Leistung nach der Nummer 9100 in derselben Kieferhälfte neben der Leistung nach der Nummer 9120 erbracht, ist ein Drittel der Gebühr der Nummer 9100 berechnungsfähig.",
			"punkte": 2694,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9110",
			"text": "Geschlossene Sinusbodenelevation vom Kieferkamm aus (interner Sinuslift) Mit einer Leistung nach der Nummer 9110 sind folgende Leistungen abgegolten: Schaffung des Zugangs durch die Alveole oder das Implantatfach, Anhebung des Kieferhöhlenbodens durch knochenverdrängende oder knochenverdichtende Maßnahmen und der Kieferhöhlenmembran, Entnahme von Knochenspänen innerhalb des Aufbaugebietes des Implantatfaches und Einbringen von Aufbaumaterial (Knochen und/oder Knochenersatzmaterial)",
			"hinweis": "Die Leistung nach der Nummer 9110 ist für dieselbe Implantatkavität nicht neben den Leistungen nach den Nummern 9120 und 9130 berechnungsfähig.",
			"punkte": 1500,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9120",
			"text": "Sinusbodenelevation durch externe Knochenfensterung (externer Sinuslift), je Kieferhälfte Mit einer Leistung nach der Nummer 9120 sind folgende Leistungen abgegolten: Schaffung des Zugangs zur Kieferhöhle durch Knochenfensterung (auch Knochendeckel), Präparation der Kieferhöhlenmembran, Anhebung des Kieferhöhlenbodens und der Kieferhöhlenmembran, Lagerbildung, gegebenenfalls Entnahme von Knochenspänen innerhalb des Aufbaugebietes, Einbringung von Aufbaumaterial (Knochen und/oder Knochenersatzmaterial), gegebenenfalls Einbringung resorbierbarer oder nicht resorbierbarer Barrieren – einschließlich Fixierung –, gegebenenfalls Reposition des Knochendeckels, Verschluss der Kieferhöhle und Wundverschluss",
			"hinweis": "",
			"punkte": 3e3,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9130",
			"text": "Spaltung und Spreizung von Knochensegmenten (Bone Splitting), gegebenenfalls mit Auffüllung der Spalträume mittels Knochen oder Knochenersatzmaterial, gegebenenfalls einschließlich zusätzlicher Osteosynthesemaßnahmen, gegebenenfalls einschließlich Einbringung resorbierbarer oder nicht resorbierbarer Barrieren und deren Fixierung je Kieferhälfte oder Frontzahnbereich, oder vertikale Distraktion des Alveolarfortsatzes einschließlich Fixierung, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Neben der Leistung nach der Nummer 9130 ist die Leistung nach der Nummer 9100 nicht berechnungsfähig.",
			"punkte": 1540,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9140",
			"text": "Intraorale Entnahme von Knochen außerhalb des Aufbaugebietes gegebenenfalls einschließlich Aufbereitung des Knochenmaterials und/oder der Aufnahmeregion, einschließlich der notwendigen Versorgung der Entnahmestelle, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Bei Entnahme von einem oder mehreren Knochenblöcken ist das Doppelte der Gebühr nach der Nummer 9140 berechnungsfähig. Von einem Knochenblock im Sinne dieser Abrechnungsbestimmung ist auszugehen, wenn dieser bei der Implantation eigenständig fixiert werden muss.",
			"punkte": 650,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9150",
			"text": "Fixation oder Stabilisierung des Augmentates durch Osteosynthesemaßnahmen (z. B. Schrauben- oder Plattenosteosynthese oder Titannetze), zusätzlich zu der Leistung nach der Nummer 9100, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 675,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9160",
			"text": "Entfernung unter der Schleimhaut liegender Materialien (z. B. Barrieren – einschließlich Fixierung –, Osteosynthesematerial), je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "",
			"punkte": 330,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "9170",
			"text": "Entfernung im Knochen liegender Materialien durch Osteotomie (z. B. Osteosynthesematerial, Knochenschrauben) oder Entfernung eines subperiostalen Gerüstimplantats, je Kieferhälfte oder Frontzahnbereich",
			"hinweis": "Die Entfernung eines Implantats ist mit der Gebühr für die Leistungen nach den Nummern 3000 und 3030 abgegolten.",
			"punkte": 500,
			"abschnitt": "K Implantologie"
		},
		{
			"nr": "0500",
			"text": "Zuschlag bei nichtstationärer Durchführung von zahnärztlich-chirurgischen Leistungen, die mit Punktzahlen von 250 bis 499 Punkten bewertet sind, oder zu den Leistungen nach den Nummern 4090 oder 4130Der Zuschlag nach der Nummer 0500 ist je Behandlungstag nur einmal berechnungsfähig. Der Zuschlag nach der Nummer 0500 ist neben den Zuschlägen nach den Nummern 0510 bis 0530 nicht berechnungsfähig.",
			"hinweis": "",
			"punkte": 400,
			"abschnitt": "L Zuschläge"
		},
		{
			"nr": "0510",
			"text": "Zuschlag bei nichtstationärer Durchführung von zahnärztlich-chirurgischen Leistungen, die mit Punktzahlen von 500 bis 799 Punkten bewertet sind",
			"hinweis": "Der Zuschlag nach der Nummer 0510 ist je Behandlungstag nur einmal berechnungsfähig. Der Zuschlag nach der Nummer 0510 ist neben den Zuschlägen nach den Nummern 0500, 0520 und/oder 0530 nicht berechnungsfähig.",
			"punkte": 750,
			"abschnitt": "L Zuschläge"
		},
		{
			"nr": "0520",
			"text": "Zuschlag bei nichtstationärer Durchführung von zahnärztlich-chirurgischen Leistungen, die mit Punktzahlen von 800 bis 1199 Punkten bewertet sind",
			"hinweis": "Der Zuschlag nach der Nummer 0520 ist je Behandlungstag nur einmal berechnungsfähig. Der Zuschlag nach der Nummer 0520 ist neben den Zuschlägen nach den Nummern 0500, 0510 und/oder 0530 nicht berechnungsfähig.",
			"punkte": 1300,
			"abschnitt": "L Zuschläge"
		},
		{
			"nr": "0530",
			"text": "Zuschlag bei nichtstationärer Durchführung von zahnärztlich-chirurgischen Leistungen, die mit Punktzahlen von 1200 und mehr Punkten bewertet sind",
			"hinweis": "Der Zuschlag nach der Nummer 0530 ist je Behandlungstag nur einmal berechnungsfähig. Der Zuschlag nach der Nummer 0530 ist neben den Zuschlägen nach den Nummern 0500 bis 0520 nicht berechnungsfähig.",
			"punkte": 2200,
			"abschnitt": "L Zuschläge"
		}
	]
};
var beb_itz_2024_default = {
	typ: "beb",
	name: "BEB Preisliste ITZ GmbH (Stand 23.01.2024)",
	gueltigAb: "2024-01-23",
	quelle: "https://itzgmbh.de/wp-content/uploads/BEB-2024.pdf",
	hinweis: "Per Texterkennung aus einem Scan übernommen – Preise vor Verwendung prüfen.",
	eintraege: [
		{
			"nr": "0001",
			"text": "Modell aus Hartgips",
			"preis": 10.4
		},
		{
			"nr": "0002",
			"text": "Modell aus Superhartgips",
			"preis": 10.4
		},
		{
			"nr": "0004",
			"text": "Modell nach Überabformung",
			"preis": 23.64
		},
		{
			"nr": "0007",
			"text": "Kontrollmodell",
			"preis": 10.4
		},
		{
			"nr": "0009",
			"text": "Modell aus Kunststoff",
			"preis": 23
		},
		{
			"nr": "0010",
			"text": "Spezialmodell",
			"preis": 23
		},
		{
			"nr": "0018",
			"text": "Modell bei Implantatversorgung",
			"preis": 10.4
		},
		{
			"nr": "0019",
			"text": "Frässmodell",
			"preis": 16
		},
		{
			"nr": "0020",
			"text": "Remontage-Modell",
			"preis": 10.4
		},
		{
			"nr": "0021",
			"text": "Sägemodell",
			"preis": 23
		},
		{
			"nr": "0023",
			"text": "Modell für Einzelstümpfe",
			"preis": 10.4
		},
		{
			"nr": "0024",
			"text": "Verwendung Kunststoff",
			"preis": 19.64
		},
		{
			"nr": "0029",
			"text": "Keramikstufe",
			"preis": 40
		},
		{
			"nr": "0033",
			"text": "Bissgabel nach Gauge",
			"preis": 15
		},
		{
			"nr": "0036",
			"text": "Versandkosten bei Datenlieferung",
			"preis": 8.52
		},
		{
			"nr": "0037",
			"text": "Konstruieren und Fräsen einer Basis aus Kunststoff",
			"preis": 102
		},
		{
			"nr": "0039",
			"text": "Interimsprothese aus Polyamid",
			"preis": 199
		},
		{
			"nr": "0040",
			"text": "Interimsprothese aus Polyamid",
			"preis": 249
		},
		{
			"nr": "0042",
			"text": "Fräsen eines Sekundärteils NEM",
			"preis": 138
		},
		{
			"nr": "0105",
			"text": "Stumpf aus Kunststoff",
			"preis": 8.5
		},
		{
			"nr": "0217",
			"text": "Stumpf unter Mikroskop vorbereiten",
			"preis": 5.5
		},
		{
			"nr": "0221",
			"text": "Hilfsteil in Abdruck",
			"preis": 9
		},
		{
			"nr": "0223",
			"text": "Zahnfleischmaske, abnehmbar je Kieferhälfte",
			"preis": 31
		},
		{
			"nr": "0224",
			"text": "Modellimplantat repositionieren",
			"preis": 11
		},
		{
			"nr": "0225",
			"text": "Implantatpfosten auf Modellierimplantat aufschrauben",
			"preis": 6.2
		},
		{
			"nr": "0241",
			"text": "Dublieren eines Modelles oder Modellteiles",
			"preis": 21.33
		},
		{
			"nr": "0243",
			"text": "Dublieren eines Einzelstumpfes",
			"preis": 13.66
		},
		{
			"nr": "0251",
			"text": "Angeliefertes Modell untersockeln",
			"preis": 10.4
		},
		{
			"nr": "0252",
			"text": "Angeliefertes Modell oder Zahnkranz bearbeiten",
			"preis": 10.4
		},
		{
			"nr": "0253",
			"text": "Split-Cast Sockel an Modell: Erklärung und Preis",
			"preis": 10.4
		},
		{
			"nr": "0301",
			"text": "Zahn vermessen",
			"preis": 5
		},
		{
			"nr": "0302",
			"text": "Modell vermessen",
			"preis": 7
		},
		{
			"nr": "0307",
			"text": "Radieren des Abschlussrandes",
			"preis": 11
		},
		{
			"nr": "0401",
			"text": "Montage eines Modellpaares in Fixator",
			"preis": 13.07
		},
		{
			"nr": "0402",
			"text": "Modellmontage in Mittelwertartikulator I",
			"preis": 14.75
		},
		{
			"nr": "0403",
			"text": "Modellmontage in Mittelwertartikulator II",
			"preis": 16.2
		},
		{
			"nr": "0404",
			"text": "Modellmontage in Mittelwert nach Gesichtsbogen",
			"preis": 26.5
		},
		{
			"nr": "0405",
			"text": "Modellmontage in individuellen Artikulator II",
			"preis": 16.2
		},
		{
			"nr": "0408",
			"text": "Montage eines Gegenkiefermodelles",
			"preis": 7.7
		},
		{
			"nr": "0511",
			"text": "Mehraufwand für Einstellen nach Zentrikregistrat",
			"preis": 7.7
		},
		{
			"nr": "0521",
			"text": "Auswerten eines Registrates",
			"preis": 25.5
		},
		{
			"nr": "0522",
			"text": "Frontzahnführungsteller individuell",
			"preis": 26.5
		},
		{
			"nr": "0523",
			"text": "Pfeilwinkel auf Frontzahnführungsteller übertragen",
			"preis": 26.5
		},
		{
			"nr": "0601",
			"text": "Modellpaar trimmen, okklusionsbezogen",
			"preis": 11
		},
		{
			"nr": "0602",
			"text": "Modellpaar sockeln, dreidimensional",
			"preis": 11
		},
		{
			"nr": "0701",
			"text": "Versand je Versandgang",
			"preis": 8.52
		},
		{
			"nr": "0702",
			"text": "Sonderversand oder Fahrtkosten",
			"preis": 25
		},
		{
			"nr": "0703",
			"text": "Versand UPS Express bis 12:00",
			"preis": 14
		},
		{
			"nr": "0705",
			"text": "nachträgliche Farbanpassung im Labor",
			"preis": 58
		},
		{
			"nr": "0706",
			"text": "Foto oder Video Dokumentation",
			"preis": 10
		},
		{
			"nr": "0710",
			"text": "Eilterminzuschlag",
			"preis": 1
		},
		{
			"nr": "0721",
			"text": "Zeiteinheit, Zahntechniker-Meister je 15 Min",
			"preis": 28.5
		},
		{
			"nr": "0722",
			"text": "Zeiteinheit, Zahntechniker je 15 Min",
			"preis": 20
		},
		{
			"nr": "0723",
			"text": "Zahnfarbenbestimmung im Labor",
			"preis": 30
		},
		{
			"nr": "0724",
			"text": "Zahnfarbenbestimmung in der Praxis incl. Anfahrt",
			"preis": 45
		},
		{
			"nr": "0731",
			"text": "Individuelle Namenskennzeichnung",
			"preis": 35
		},
		{
			"nr": "0732",
			"text": "Desinfektion",
			"preis": 1.8
		},
		{
			"nr": "0801",
			"text": "Prothetische Planung",
			"preis": 15
		},
		{
			"nr": "0802",
			"text": "Prothetische Alternativplanung",
			"preis": 10
		},
		{
			"nr": "0811",
			"text": "Modellanalyse für Prothetik",
			"preis": 15
		},
		{
			"nr": "0821",
			"text": "Kostenvoranschlag",
			"preis": 15
		},
		{
			"nr": "0833",
			"text": "Set-Up/WaxUp/MockUp - je Zahn",
			"preis": 19
		},
		{
			"nr": "1002",
			"text": "Basis für Bissregistrierung",
			"preis": 31.68
		},
		{
			"nr": "1003",
			"text": "Basis für Stützstiftregistrat",
			"preis": 31.68
		},
		{
			"nr": "1005",
			"text": "Funktionslöffel aus Kunststoff",
			"preis": 31.68
		},
		{
			"nr": "1006",
			"text": "Individueller Löffel aus Kunststoff",
			"preis": 31.68
		},
		{
			"nr": "1007",
			"text": "Basis für Aufstellung",
			"preis": 31.68
		},
		{
			"nr": "1019",
			"text": "Basis für neue Abdrucknahme vorbereiten",
			"preis": 12
		},
		{
			"nr": "1108",
			"text": "Löffel für Implantatversorgung",
			"preis": 31.68
		},
		{
			"nr": "1111",
			"text": "Bisswall aus Wachs, auf Basis",
			"preis": 9.9
		},
		{
			"nr": "1113",
			"text": "Bisswall aus Kunststoff, auf Basis",
			"preis": 9.9
		},
		{
			"nr": "1115",
			"text": "Registrierplatte und -stift auf Basen",
			"preis": 39
		},
		{
			"nr": "1122",
			"text": "Wachsplatte für zentrische Bissnahme im Artikulator vorbereiten",
			"preis": 35
		},
		{
			"nr": "1201",
			"text": "Übertragungskappe aus Kunststoff",
			"preis": 12
		},
		{
			"nr": "1223",
			"text": "Basis für Bohrschablone bei Implantat",
			"preis": 31.68
		},
		{
			"nr": "1225",
			"text": "Implantat-Kontrollschablone",
			"preis": 25
		},
		{
			"nr": "1251",
			"text": "Vorwall",
			"preis": 8
		},
		{
			"nr": "1311",
			"text": "Röntgenkugel oder Bohrhülse positionieren",
			"preis": 7
		},
		{
			"nr": "1341",
			"text": "Walkhoffsche Tastkugel an Bißschablone",
			"preis": 12
		},
		{
			"nr": "1401",
			"text": "Provisorische Krone, Brückenglied, Stiftzahn, Onlay, Inlay aus Kunststoff",
			"preis": 35
		},
		{
			"nr": "1402",
			"text": "Provisorische Krone, Brückenglied, Stiftzahn, Onlay, Inlay aus Metall",
			"preis": 35
		},
		{
			"nr": "1403",
			"text": "Metallarmierung für provisorische Versorgung",
			"preis": 48
		},
		{
			"nr": "1404",
			"text": "Formteil für provisorische Versorgung",
			"preis": 35
		},
		{
			"nr": "1405",
			"text": "Formteil Kunststoff (Schleifkäppchen)",
			"preis": 19.2
		},
		{
			"nr": "1406",
			"text": "Reiseprothese aus PMMA (monochrome)",
			"preis": 190
		},
		{
			"nr": "1601",
			"text": "Allergietestplättchen",
			"preis": 11
		},
		{
			"nr": "1902",
			"text": "Aufwand bei Suprastruktur",
			"preis": 28.5
		},
		{
			"nr": "2001",
			"text": "Wurzelstift gegossen",
			"preis": 108.67
		},
		{
			"nr": "2011",
			"text": "Wurzelkappe",
			"preis": 108.67
		},
		{
			"nr": "2012",
			"text": "Wurzelstiftkappe",
			"preis": 108.67
		},
		{
			"nr": "2033",
			"text": "Individuelles Abutment",
			"preis": 95.31
		},
		{
			"nr": "2035",
			"text": "Gusstufenkrone oder Stegkappe auf Implantataufbau nach",
			"preis": 115.8
		},
		{
			"nr": "2101",
			"text": "Krone gegossen/gefräst",
			"preis": 115.8
		},
		{
			"nr": "2104",
			"text": "Dreiviertelkrone gegossen/gefräst",
			"preis": 115.8
		},
		{
			"nr": "2121",
			"text": "Krone gegossen / gefräst für Keramik/Kompositverblendung",
			"preis": 95
		},
		{
			"nr": "2126",
			"text": "Dreiviertelkrone gegossen/gefräst für Keramik/Kompositverblendung",
			"preis": 85.1
		},
		{
			"nr": "2154",
			"text": "Dreiviertelkrone gefräst",
			"preis": 80
		},
		{
			"nr": "2155",
			"text": "Anker gegossen/gefräst, für Klebebrücke",
			"preis": 114.38
		},
		{
			"nr": "2181",
			"text": "Stegkappe",
			"preis": 115.8
		},
		{
			"nr": "2251",
			"text": "Seitenzahnkrone aus Keramik gefräst (vollanatomisch)",
			"preis": 110
		},
		{
			"nr": "2252",
			"text": "Frontzahnkrone aus Keramik gefräst (vollanatomisch)",
			"preis": 135
		},
		{
			"nr": "2281",
			"text": "Krone aus Keramik gefräst",
			"preis": 110
		},
		{
			"nr": "2301",
			"text": "Inlay einflächig",
			"preis": 90
		},
		{
			"nr": "2302",
			"text": "Inlay zweiflächig",
			"preis": 90
		},
		{
			"nr": "2303",
			"text": "Inlay dreiflächig",
			"preis": 90
		},
		{
			"nr": "2304",
			"text": "Inlay mehrflächig",
			"preis": 115.8
		},
		{
			"nr": "2351",
			"text": "Brückenglied gefräßt Seitenzahn (vollanatomisch)",
			"preis": 110
		},
		{
			"nr": "2352",
			"text": "Brückenglied gefräßt Frontzahn (vollanatomisch)",
			"preis": 135
		},
		{
			"nr": "2361",
			"text": "Brückenglied gegossen/gefräst Metall",
			"preis": 98
		},
		{
			"nr": "2534",
			"text": "Teilkrone Keramik",
			"preis": 116.8
		},
		{
			"nr": "2551",
			"text": "Inlay aus Keramik, gefräst, einflächig",
			"preis": 78
		},
		{
			"nr": "2552",
			"text": "Inlay aus Keramik, gefräst, zweiflächig",
			"preis": 87
		},
		{
			"nr": "2553",
			"text": "Inlay aus Keramik, gefräst, dreiflächig",
			"preis": 98
		},
		{
			"nr": "2554",
			"text": "Inlay aus Keramik, gefräst, mehrflächig",
			"preis": 115.8
		},
		{
			"nr": "2601",
			"text": "Teil-Verblendungaus Komposite",
			"preis": 103.4
		},
		{
			"nr": "2602",
			"text": "mehrflachige Verblendungaus Komposite",
			"preis": 105.4
		},
		{
			"nr": "2603",
			"text": "Verblendschale aus Kunststoff",
			"preis": 72
		},
		{
			"nr": "2611",
			"text": "Teil-Verblendung aus Keramik",
			"preis": 132.2
		},
		{
			"nr": "2612",
			"text": "Mehrflächige Verblendung aus Keramik",
			"preis": 135.21
		},
		{
			"nr": "2653",
			"text": "Veneer aus Keramik",
			"preis": 135.21
		},
		{
			"nr": "2663",
			"text": "Verblendschale aus Komposit",
			"preis": 105.4
		},
		{
			"nr": "2671",
			"text": "Papille aus Komposite",
			"preis": 29
		},
		{
			"nr": "2672",
			"text": "Zahnfleisch aus Komposite",
			"preis": 29
		},
		{
			"nr": "2676",
			"text": "Papille aus Keramik",
			"preis": 52.5
		},
		{
			"nr": "2677",
			"text": "Zahnfleisch aus Keramik",
			"preis": 52.5
		},
		{
			"nr": "2678",
			"text": "Wurzelpontic aus Keramik",
			"preis": 52.5
		},
		{
			"nr": "2682",
			"text": "Papille aus Komposit",
			"preis": 29
		},
		{
			"nr": "2901",
			"text": "Stiftaufbau in vorhandene Krone einarbeiten",
			"preis": 35
		},
		{
			"nr": "2904",
			"text": "Angelieferte Modellation gießen/pressen",
			"preis": 29
		},
		{
			"nr": "2907",
			"text": "Brückenteilungsgeschiebe, individuell",
			"preis": 260
		},
		{
			"nr": "2909",
			"text": "Individuelles Charakterisieren eines Kunststoffzahnes",
			"preis": 20
		},
		{
			"nr": "2911",
			"text": "Krone/Brückenglied für Klammer vorbereiten",
			"preis": 21.13
		},
		{
			"nr": "2912",
			"text": "Krone/Brückenglied, Inlay passend für vorhandene Prothese arbeiten",
			"preis": 21.13
		},
		{
			"nr": "2913",
			"text": "Umgehungsbügel bei Diastema",
			"preis": 15
		},
		{
			"nr": "2918",
			"text": "Krone/Brückenglied für Klammer vorbereiten",
			"preis": 21.13
		},
		{
			"nr": "2922",
			"text": "Krone/Inlay/Brückenglied aufpassen",
			"preis": 7
		},
		{
			"nr": "2941",
			"text": "Individuell charakterisieren, Kunststoff",
			"preis": 15
		},
		{
			"nr": "2945",
			"text": "Individuell charakterisieren, Komposit",
			"preis": 15
		},
		{
			"nr": "2951",
			"text": "Individuell charakterisieren, Keramik",
			"preis": 21
		},
		{
			"nr": "2953",
			"text": "Fräsen je Glied bei Datenlieferung Material Katana YML",
			"preis": 39
		},
		{
			"nr": "2954",
			"text": "Fräsen je Glied bei Datenanlieferung - Material Katana MLo.ä.",
			"preis": 21.5
		},
		{
			"nr": "2955",
			"text": "Fräsen je Glied bei Datenanlieferung - Material NEM",
			"preis": 21.5
		},
		{
			"nr": "2956",
			"text": "Fräsen je Glied bei Datenanlieferung - Material PMMA",
			"preis": 21.5
		},
		{
			"nr": "2957",
			"text": "Fräsen einer Aufbisschiene bei Datenanlieferung (PMMA)",
			"preis": 53
		},
		{
			"nr": "2958",
			"text": "Fräsen einer Aufbisschiene bei Datenlieferung (Nylon)",
			"preis": 63
		},
		{
			"nr": "2959",
			"text": "Konst. und Fräsen einer Aufbisschiene bei Modellanlieferung (Nylon)",
			"preis": 73
		},
		{
			"nr": "2960",
			"text": "Konst. und Fräsen einer Aufbisschiene bei Modellanlieferung (PMMA)",
			"preis": 83
		},
		{
			"nr": "2961",
			"text": "Konst. und Fräsen KuB (NEM)",
			"preis": 32
		},
		{
			"nr": "2962",
			"text": "Konst. und Fräsen KuB aus (PMMA)",
			"preis": 29
		},
		{
			"nr": "2963",
			"text": "Krone/Inlay/Brückenglied aufpassen",
			"preis": 7
		},
		{
			"nr": "2964",
			"text": "Konst. und Fräsen KuB aus (ZrO2 Mono)",
			"preis": 29
		},
		{
			"nr": "2965",
			"text": "Konst. und Fräsen KuB aus (ZrO2 Multi)",
			"preis": 49
		},
		{
			"nr": "2966",
			"text": "Konst. und Fräsen KuB aus (Li2Silikat)",
			"preis": 69
		},
		{
			"nr": "2967",
			"text": "Fräsen je Glied bei Datenlieferung - Material (e.max)",
			"preis": 59
		},
		{
			"nr": "2972",
			"text": "Aufwandzu Suprastrukturbeiverschraubbarem Implantat",
			"preis": 28
		},
		{
			"nr": "2981",
			"text": "NEM Zuschlag",
			"preis": 20.46
		},
		{
			"nr": "2983",
			"text": "Titan verarbeiten bei festsitzendem Zahnersatz",
			"preis": 20.46
		},
		{
			"nr": "2984",
			"text": "Wax UP je Zahn",
			"preis": 13
		},
		{
			"nr": "3001",
			"text": "Teleskopkrone, primär/Sekundär",
			"preis": 210
		},
		{
			"nr": "3004",
			"text": "Teleskopkrone",
			"preis": 320
		},
		{
			"nr": "3021",
			"text": "Individuelles Geschiebe",
			"preis": 290
		},
		{
			"nr": "3023",
			"text": "Konfektioniertes Geschiebe, Gelenk, Anker einarbeiten",
			"preis": 135
		},
		{
			"nr": "3024",
			"text": "Lager für Raste",
			"preis": 35
		},
		{
			"nr": "3025",
			"text": "Umlaufraste für Schubverteilungsarm",
			"preis": 35
		},
		{
			"nr": "3027",
			"text": "Locator/Kugelanker in proth. einarbeiten",
			"preis": 130
		},
		{
			"nr": "3031",
			"text": "Individueller Steg, Grundeinheit",
			"preis": 95
		},
		{
			"nr": "3032",
			"text": "Individueller Steg, Längeneinheit",
			"preis": 15
		},
		{
			"nr": "3104",
			"text": "Stegfräsung",
			"preis": 110
		},
		{
			"nr": "3105",
			"text": "gefrästes Lager",
			"preis": 70
		},
		{
			"nr": "3215",
			"text": "Schubverteilungsarm",
			"preis": 59
		},
		{
			"nr": "3221",
			"text": "Individuelles Steggeschiebe",
			"preis": 260
		},
		{
			"nr": "3322",
			"text": "Steggeschiebe individuell, an/in Metallbasis",
			"preis": 54.96
		},
		{
			"nr": "3401",
			"text": "Drehriegel",
			"preis": 235
		},
		{
			"nr": "3403",
			"text": "Schwenkriegel",
			"preis": 235
		},
		{
			"nr": "3405",
			"text": "Schub- oder Steckriegel",
			"preis": 235
		},
		{
			"nr": "3521",
			"text": "Konfektionssteg Grundeinheit",
			"preis": 89
		},
		{
			"nr": "3523",
			"text": "Konfektionssteg Längeneinheit",
			"preis": 19
		},
		{
			"nr": "3621",
			"text": "Konfektions-Steglasche an/in Kunststoffbasis",
			"preis": 65
		},
		{
			"nr": "3623",
			"text": "Konfektions-Steglasche an/in Metallbasis",
			"preis": 75
		},
		{
			"nr": "3903",
			"text": "Friktionsstift einarbeiten",
			"preis": 32.5
		},
		{
			"nr": "3905",
			"text": "Verschraubung/Verbolzung",
			"preis": 102
		},
		{
			"nr": "3906",
			"text": "Verschraubung Implantat",
			"preis": 33
		},
		{
			"nr": "3931",
			"text": "Lösungsknopf für Verbindungselement",
			"preis": 31
		},
		{
			"nr": "4001",
			"text": "Metallbasis",
			"preis": 175
		},
		{
			"nr": "4007",
			"text": "Gitter total",
			"preis": 110
		},
		{
			"nr": "4008",
			"text": "Bügel",
			"preis": 110
		},
		{
			"nr": "4101",
			"text": "Einarmige Klammer gebogen",
			"preis": 12.8
		},
		{
			"nr": "4103",
			"text": "Kralle gebogen",
			"preis": 12.8
		},
		{
			"nr": "4106",
			"text": "Fortlaufende Klammer je Zahn gebogen",
			"preis": 12.8
		},
		{
			"nr": "4107",
			"text": "Gegenlager gebogen",
			"preis": 12.8
		},
		{
			"nr": "4111",
			"text": "Zweiarmige gefräste Klammer (Valplast)",
			"preis": 63
		},
		{
			"nr": "4112",
			"text": "Zweiarmige Klammer mit Auflage gebogen",
			"preis": 25.22
		},
		{
			"nr": "4119",
			"text": "Bonwill-Klammer gebogen",
			"preis": 25.22
		},
		{
			"nr": "4121",
			"text": "Ney Stiel gebogen",
			"preis": 15
		},
		{
			"nr": "4122",
			"text": "Auflage gegossen",
			"preis": 18.33
		},
		{
			"nr": "4201",
			"text": "gossene Retention",
			"preis": 69
		},
		{
			"nr": "4202",
			"text": "Gegossenes Basisteil",
			"preis": 96.54
		},
		{
			"nr": "4203",
			"text": "Retention an Sekundärteil",
			"preis": 49
		},
		{
			"nr": "4208",
			"text": "Retention gebogen",
			"preis": 50.44
		},
		{
			"nr": "4401",
			"text": "Einarmige Klammer gegossen",
			"preis": 18.33
		},
		{
			"nr": "4411",
			"text": "Zweiarmige Klammer gegossen",
			"preis": 21
		},
		{
			"nr": "4412",
			"text": "Zweiarmige Klammer mit Auflage gegossen",
			"preis": 30.97
		},
		{
			"nr": "4413",
			"text": "Bonwillkammer gegossen",
			"preis": 76.32
		},
		{
			"nr": "4421",
			"text": "Bearbeiten eines Implantataufbaus",
			"preis": 41
		},
		{
			"nr": "4431",
			"text": "Federarm inklusive Federarmlager",
			"preis": 17.9
		},
		{
			"nr": "4902",
			"text": "Rückenschutzplatte",
			"preis": 55.24
		},
		{
			"nr": "4903",
			"text": "Ruckenschutzplatte",
			"preis": 55.24
		},
		{
			"nr": "4905",
			"text": "Metallzahn",
			"preis": 55.24
		},
		{
			"nr": "4907",
			"text": "Metallfläche als Tuberabdeckung",
			"preis": 24
		},
		{
			"nr": "4941",
			"text": "Lösungsknopf für Friktionsprothese",
			"preis": 13
		},
		{
			"nr": "4951",
			"text": "Klammer einzeln gegossen",
			"preis": 27.2
		},
		{
			"nr": "5211",
			"text": "Lötvergoldung",
			"preis": 30
		},
		{
			"nr": "5307",
			"text": "Konditionieren je Zahn / Flügel",
			"preis": 20.9
		},
		{
			"nr": "6001",
			"text": "Aufstellen Grundeinheit",
			"preis": 41.6
		},
		{
			"nr": "6002",
			"text": "Aufstellen je Zahneinheit auf Wachs oder Kunststoffbasis",
			"preis": 2.69
		},
		{
			"nr": "6003",
			"text": "Aufstellen je Zahneinheit auf Metallbasis",
			"preis": 3.26
		},
		{
			"nr": "6021",
			"text": "Übertragen einer Wachsaufstellung auf Metallbasis",
			"preis": 2.22
		},
		{
			"nr": "6121",
			"text": "Zuschlag für Aufstellung bei Anwesenheit des Patienten",
			"preis": 60.5
		},
		{
			"nr": "6301",
			"text": "Grundeinheit Fertigstellung mit Kunststoffbasis",
			"preis": 69.84
		},
		{
			"nr": "6302",
			"text": "Fertigstellen mit Kunststoffbasis, je Zahneinheit",
			"preis": 4.86
		},
		{
			"nr": "6311",
			"text": "Grundeinheit Fertigstellung auf Metallbasis",
			"preis": 69.84
		},
		{
			"nr": "6312",
			"text": "Fertigstellen auf Metallbasis, je Zahneinheit",
			"preis": 4.86
		},
		{
			"nr": "6401",
			"text": "Transparente Gaumenplatte",
			"preis": 52.54
		},
		{
			"nr": "6405",
			"text": "Verarbeitung Weichkunststoff",
			"preis": 75.72
		},
		{
			"nr": "6412",
			"text": "Sonderkunststoff verarbeiten",
			"preis": 75.72
		},
		{
			"nr": "6414",
			"text": "Unterfütterbarer Abschlussrand",
			"preis": 27.62
		},
		{
			"nr": "6431",
			"text": "Befestigung eines Zahnes mit zahnfarbenem Kunststoff, Pontic",
			"preis": 12.5
		},
		{
			"nr": "6432",
			"text": "Herstellen eines Zahnes aus zahnfarbenem Kunststoff",
			"preis": 21.5
		},
		{
			"nr": "6433",
			"text": "Kauflacheauszahnfarbenem Kunststoff",
			"preis": 12.5
		},
		{
			"nr": "6451",
			"text": "Zahnfleischklammer",
			"preis": 23
		},
		{
			"nr": "6452",
			"text": "Pelottenklammer",
			"preis": 23
		},
		{
			"nr": "6501",
			"text": "Netz einarbeiten",
			"preis": 90
		},
		{
			"nr": "6502",
			"text": "Gußgitter einarbeiten",
			"preis": 90
		},
		{
			"nr": "6503",
			"text": "Konfektioniertes Metallgitter anpassen und einarbeiten",
			"preis": 70
		},
		{
			"nr": "6504",
			"text": "Draht einarbeiten",
			"preis": 36.54
		},
		{
			"nr": "6505",
			"text": "Bügel einarbeiten",
			"preis": 70
		},
		{
			"nr": "6506",
			"text": "Individuelle Beschwerungseinlage einarbeiten",
			"preis": 70
		},
		{
			"nr": "6509",
			"text": "Retention für Einzelzahn einarbeiten",
			"preis": 26.39
		},
		{
			"nr": "6521",
			"text": "Metallfacette einarbeiten",
			"preis": 36.54
		},
		{
			"nr": "6905",
			"text": "Primärteleskop aus Keramik Zuschlag je Teleskop",
			"preis": 35.99
		},
		{
			"nr": "6906",
			"text": "Individueller Implantataufbau Keramik",
			"preis": 70.91
		},
		{
			"nr": "6907",
			"text": "Veneer/Inlay aus Keramik",
			"preis": 115
		},
		{
			"nr": "6908",
			"text": "Provisorische Krone/Brücke je Glied (PMMA)",
			"preis": 33
		},
		{
			"nr": "6912",
			"text": "Versand UPS Express",
			"preis": 14
		},
		{
			"nr": "7001",
			"text": "Basis für Einzelkiefergerät",
			"preis": 64.94
		},
		{
			"nr": "7002",
			"text": "Basis für bimaxiläres Gerät",
			"preis": 129
		},
		{
			"nr": "7090",
			"text": "BetterSmile-Schiene Planungspauschale",
			"preis": 90
		},
		{
			"nr": "7091",
			"text": "BetterSmile-Modell und Regulierung-Schiene (Paar)",
			"preis": 75
		},
		{
			"nr": "7104",
			"text": "Dreiecksklammer",
			"preis": 12.45
		},
		{
			"nr": "7105",
			"text": "Pfeilklammer",
			"preis": 11.6
		},
		{
			"nr": "7106",
			"text": "Adams-Klammer",
			"preis": 16.17
		},
		{
			"nr": "7122",
			"text": "Auflage",
			"preis": 12.45
		},
		{
			"nr": "7201",
			"text": "Frontaler oder lateraler Aufbiß, hart",
			"preis": 15.67
		},
		{
			"nr": "7202",
			"text": "Frontaler oder lateraler Aufbiß, weich",
			"preis": 15.67
		},
		{
			"nr": "7301",
			"text": "Labialbogen",
			"preis": 27.47
		},
		{
			"nr": "7501",
			"text": "Trennen einer Basis und Funktionsfähigmachen der Schraube",
			"preis": 12
		},
		{
			"nr": "7503",
			"text": "Trennen einer Basis ohne Schraube",
			"preis": 8
		},
		{
			"nr": "7504",
			"text": "Funktionsfähigmachen einer Schraube ohne Trennen der Basis",
			"preis": 8
		},
		{
			"nr": "7601",
			"text": "Aufbisschiene adjustiert",
			"preis": 110.7
		},
		{
			"nr": "7602",
			"text": "Aufbisschiene nicht adjustiert",
			"preis": 80.19
		},
		{
			"nr": "7606",
			"text": "Bleaching Schiene",
			"preis": 52.95
		},
		{
			"nr": "7607",
			"text": "Fluoridierungsschiene",
			"preis": 59.69
		},
		{
			"nr": "7621",
			"text": "Aufbissschiene adjustiert",
			"preis": 110.7
		},
		{
			"nr": "7801",
			"text": "Sportschutz aus Weichkunststoff",
			"preis": 170
		},
		{
			"nr": "8002",
			"text": "Basis unterfüttern",
			"preis": 79.14
		},
		{
			"nr": "8003",
			"text": "Basis erneuern",
			"preis": 79.14
		},
		{
			"nr": "8006",
			"text": "Einarbeiten einer Modellgussbasis in vorhandene Kunststoffprothese",
			"preis": 70
		},
		{
			"nr": "8011",
			"text": "Instandsetzen einer Prothese, Kunststoffbasis oder KFO/FKO Gerät, Grundeinheit",
			"preis": 29.14
		},
		{
			"nr": "8021",
			"text": "Leistungseinheit, Sprung aus Kunststoff",
			"preis": 12.55
		},
		{
			"nr": "8022",
			"text": "Leistungseinheit, Bruch aus Kunststoff",
			"preis": 12.55
		},
		{
			"nr": "8023",
			"text": "Leistungseinheit, Wiederbefestigung Zahn",
			"preis": 12.55
		},
		{
			"nr": "8024",
			"text": "Leistungseinheit, Erneuerung Zahn",
			"preis": 12.55
		},
		{
			"nr": "8025",
			"text": "Leistungseinheit, Klammer einarbeiten",
			"preis": 12.55
		},
		{
			"nr": "8027",
			"text": "Leistungseinheit, Basisteil aus Kunststoff",
			"preis": 12.55
		},
		{
			"nr": "8028",
			"text": "Leistungseinheit, Sprung aus Metall",
			"preis": 12.55
		},
		{
			"nr": "8029",
			"text": "Leistungseinheit, Bruch aus Metall",
			"preis": 12.55
		},
		{
			"nr": "8030",
			"text": "Leistungseinheit, Kunststoffsattel lösen und wiederbefestigen",
			"preis": 12.55
		},
		{
			"nr": "8034",
			"text": "Leistungseinheit, Sekundärteil",
			"preis": 65.67
		},
		{
			"nr": "8036",
			"text": "Leistungseinheit Metallverbindung/Wiederherstellung",
			"preis": 27.38
		},
		{
			"nr": "8039",
			"text": "Prothesensattel kürzen, ausschleifen und polieren",
			"preis": 20.15
		},
		{
			"nr": "8111",
			"text": "Auswechseln von Konfektionsteil, einfach",
			"preis": 18.39
		},
		{
			"nr": "8112",
			"text": "Auswechseln von Konfektionsteil, kompliziert",
			"preis": 21
		},
		{
			"nr": "8123",
			"text": "Prothese/ABS/KFO-Gerät säubern und polieren",
			"preis": 35
		},
		{
			"nr": "8201",
			"text": "Kronen- oder Brückenglied Reparatur, je Glied",
			"preis": 49.8
		},
		{
			"nr": "8211",
			"text": "Leistungseinheit, Instandsetzen individueller Riegel",
			"preis": 25
		},
		{
			"nr": "8212",
			"text": "Leistungseinheit, Aktivieren Teleskopkrone oder Steggeschiebe",
			"preis": 25
		},
		{
			"nr": "8999",
			"text": "Rapid Prototyping Druck Pro Gramm inkl. Stützmaterial",
			"preis": 1.9
		},
		{
			"nr": "9029",
			"text": "Gerustaus Zikon monolitisch",
			"preis": 29
		},
		{
			"nr": "9031",
			"text": "Gerust vollanatomisch(glasiert)",
			"preis": 75
		},
		{
			"nr": "9034",
			"text": "Gerust NEM",
			"preis": 32
		},
		{
			"nr": "9581",
			"text": "Einarbeiten Sekundärteil",
			"preis": 65.67
		},
		{
			"nr": "9634",
			"text": "Fräsen je Einheit ohne Material",
			"preis": 10
		}
	]
};
//#endregion
//#region src/daten.ts
var SPEICHER = (datei) => `planr.daten.${datei}`;
var standVon = (d) => d?.stand || d?.gueltigAb || "";
function gespeichert(datei) {
	try {
		const roh = localStorage.getItem(SPEICHER(datei));
		return roh ? JSON.parse(roh) : null;
	} catch {
		return null;
	}
}
/** Geladener Stand, wenn er neuer ist als der mitgelieferte – sonst der mitgelieferte. */
function aktuell(datei, mitgeliefert) {
	const g = typeof localStorage === "undefined" ? null : gespeichert(datei);
	return g && standVon(g) > standVon(mitgeliefert) ? g : mitgeliefert;
}
//#endregion
//#region src/engine/zahnschema.ts
/** Zahnreihenfolge von links nach rechts (Blick auf den Patienten) */
var OBERKIEFER = [
	"18",
	"17",
	"16",
	"15",
	"14",
	"13",
	"12",
	"11",
	"21",
	"22",
	"23",
	"24",
	"25",
	"26",
	"27",
	"28"
];
var UNTERKIEFER = [
	"48",
	"47",
	"46",
	"45",
	"44",
	"43",
	"42",
	"41",
	"31",
	"32",
	"33",
	"34",
	"35",
	"36",
	"37",
	"38"
];
[...OBERKIEFER, ...UNTERKIEFER];
var kieferVon = (zahn) => zahn[0] === "1" || zahn[0] === "2" ? "OK" : "UK";
var istFrontzahn = (zahn) => [
	"1",
	"2",
	"3"
].includes(zahn[1]);
var istWeisheitszahn = (zahn) => zahn.endsWith("8");
/** Befunde mit vorhandener Krone/Brückenanker, die vor der Neuversorgung entfernt wird */
var ALTE_KRONE = /* @__PURE__ */ new Set([
	"kw",
	"pkw",
	"tw",
	"aw",
	"rw",
	"skw",
	"stw",
	"t2w"
]);
//#endregion
//#region src/data/implantatsysteme.ts
var KOMPONENTEN = {
	abdruckpfosten: "Abformpfosten",
	scanbody: "Scanbody",
	laboranalog: "Laboranalog",
	abutmentStandard: "Abutment konfektioniert (Titan)",
	tiBase: "Klebebasis / Ti-Base",
	schraube: "Prothetikschraube"
};
var sys = (id, hersteller, system, preise, quelle, stand, genau) => ({
	id,
	hersteller,
	system,
	preise,
	quelle,
	stand,
	genau
});
var p = (abdruckpfosten, scanbody, laboranalog, abutmentStandard, tiBase, schraube) => ({
	abdruckpfosten,
	scanbody,
	laboranalog,
	abutmentStandard,
	tiBase,
	schraube
});
/** Listenpreise netto laut Herstellerkatalogen; „geschaetzt“ = keine öffentliche Preisliste gefunden */
var SYSTEME = [
	sys("straumann-bl", "Straumann", "Bone Level / BLT RC (BLX analog)", p(42, 40, 37, 156, 81, 27), "https://www.straumann.com/content/dam/media-center/straumann/de-de/documents/manual/straumann_de500248_systemuebersicht_bone_level_implantat.pdf", "2026-01", "ja"),
	sys("nobel-active", "Nobel Biocare", "NobelActive / NobelParallel CC RP", p(60, 75, 35, 175, 110, 30), "geschätzt (Preise nur mit Login)", "2026-10", "geschaetzt"),
	sys("astra-ev", "Dentsply Sirona", "Astra Tech Implant System EV", p(45, 105, 37, 142, 95, 21), "https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/32672075-DE-2209%20Prosthetics%20product%20catalog_Preisliste_2307_LR.pdf", "2023-07", "ja"),
	sys("ankylos", "Dentsply Sirona", "Ankylos C/X", p(61, 105, 37, 113, 97, 21), "https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/32671089-DE-1905%20Ankylos%20Product%20Catalog_Preisliste_2307_LR.pdf", "2023-07", "ja"),
	sys("xive", "Dentsply Sirona", "Xive", p(87, 105, 34, 109, 95, 15), "https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/32670052-DE-2006%20Xive%20Product%20Catalog_Preisliste_2307_LR.pdf", "2023-07", "teilweise"),
	sys("camlog", "Camlog", "CAMLOG / CONELOG", p(46, 37, 20, 88, 71, 17), "https://ebook.camlog.de/camlog/de/preisliste-camlog/", "2026-05", "ja"),
	sys("zimmer-tsv", "Zimmer Biomet", "Tapered Screw-Vent / T3", p(55, 70, 30, 140, 90, 25), "geschätzt", "2026-10", "geschaetzt"),
	sys("biohorizons", "BioHorizons", "Tapered Internal", p(50, 60, 28, 120, 85, 22), "geschätzt", "2026-10", "geschaetzt"),
	sys("bego-semados", "BEGO", "Semados S/RSX", p(45, 36, 26, 95, 55, 19), "https://security.bego.com/img/file/basic/me_800281_0014_so_de.pdf", "2022-06", "teilweise"),
	sys("bredent-copasky", "bredent medical", "copaSKY", p(39.9, 46, 28.9, 74, 69, 24.9), "https://bredent-group.com/wp-content/uploads/2026/02/Prospekt-copaSKY-ultrakurz_0099320D-20251106_web.pdf", "2025-12", "teilweise"),
	sys("champions-revolution", "Champions-Implants", "(R)Evolution", p(35, 25, 20, 25, 25, 7), "Preisliste 01/2012, ca. +25 % hochgerechnet", "2012-01", "teilweise"),
	sys("medentis-icx", "medentis medical", "ICX", p(39, 39, 19, 79, 39, 15), "https://medentis.com/Downloads/epaper/produktkatalog-26/", "2026", "teilweise"),
	sys("mis-c1", "MIS (Dentsply Sirona)", "C1 / V3 Conical Connection", p(56, 79, 37, 77, 79, 22), "https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/MIS%20Gesamtpreisliste%20DE%2007_2023_LR.pdf", "2023-07", "teilweise"),
	sys("neoss-proactive", "Neoss", "ProActive", p(55, 65, 30, 130, 85, 25), "geschätzt (Preise nur mit Login)", "2026-10", "geschaetzt"),
	sys("osstem-tsiii", "Osstem", "TSIII", p(40, 45, 20, 70, 50, 15), "geschätzt", "2026-10", "geschaetzt"),
	sys("megagen-anyridge", "MegaGen", "AnyRidge", p(45, 50, 22, 80, 60, 18), "geschätzt", "2026-10", "geschaetzt"),
	sys("thommen-element", "Thommen Medical", "SPI Element / Contact", p(75, 85, 35, 180, 110, 28), "geschätzt", "2026-10", "geschaetzt"),
	sys("sic-invent", "SIC invent", "SICace / SICmax", p(55, 61, 28, 90, 64, 17), "https://www.zwp-online.info/files/241578/MA150-02_DE_Produktkatalog_2025-05-30.pdf", "2025-03", "ja"),
	sys("dentaurum-tiologic", "Dentaurum", "tioLogic TWINFIT / ST", p(55, 60, 28, 110, 75, 20), "geschätzt (Preise nur mit Login)", "2026-10", "geschaetzt"),
	sys("implantdirect-legacy", "Implant Direct", "Legacy / InterActive", p(35, 40, 18, 60, 80, 15), "US-Listenpreise umgerechnet, Rest geschätzt", "2026-10", "teilweise")
];
var mittel = (k) => Math.round(SYSTEME.reduce((s, x) => s + x.preise[k], 0) / SYSTEME.length);
var IMPLANTATSYSTEME = [sys("durchschnitt", "Mittelwert", `System noch nicht gewählt (Ø aus ${SYSTEME.length} Systemen)`, p(mittel("abdruckpfosten"), mittel("scanbody"), mittel("laboranalog"), mittel("abutmentStandard"), mittel("tiBase"), mittel("schraube")), "Mittelwert der hinterlegten Systeme", "2026-10", "geschaetzt"), ...SYSTEME];
var implantatsystem = (id) => IMPLANTATSYSTEME.find((s) => s.id === id) ?? IMPLANTATSYSTEME[0];
//#endregion
//#region src/engine/bruecken.ts
var GLIED$1 = /^(S?B|AB)[VM]?$/;
var PFEILER = /^(S?K|PK|S?T|A$)/;
/**
* Brücken eines Kiefers in Zahnreihenfolge (18…28 bzw. 48…38): zuerst die mit „-“ markierten Bereiche,
* dann je Lauf von Brückengliedern außerhalb davon die angrenzenden Pfeiler.
* Je zwei Markierungen begrenzen eine Brücke, gleich auf welcher Seite des Kürzels der Strich steht;
* „-K-“ ist der gemeinsame Pfeiler zweier Brücken.
*/
function brueckenBereiche(reihe, kuerzel, marke) {
	const out = [];
	let start = -1;
	reihe.forEach((z, i) => {
		const m = marke(z);
		if (!m?.bAnfang && !m?.bEnde) return;
		if (start < 0) {
			start = i;
			return;
		}
		out.push({
			zaehne: reihe.slice(start, i + 1),
			explizit: true
		});
		start = m.bAnfang && m.bEnde ? i : -1;
	});
	const markiert = new Set(out.flatMap((b) => b.zaehne));
	let akt = [];
	const abschliessen = () => {
		if (!akt.length) return;
		const links = reihe[akt[0] - 1];
		const rechts = reihe[akt[akt.length - 1] + 1];
		const zaehne = akt.map((i) => reihe[i]);
		out.push({
			zaehne: [
				...links && PFEILER.test(kuerzel(links)) ? [links] : [],
				...zaehne,
				...rechts && PFEILER.test(kuerzel(rechts)) ? [rechts] : []
			],
			explizit: false
		});
		akt = [];
	};
	reihe.forEach((z, i) => {
		if (GLIED$1.test(kuerzel(z)) && !markiert.has(z)) akt.push(i);
		else abschliessen();
	});
	abschliessen();
	return out;
}
/** Pfeiler einer explizit markierten Brücke: alle Kronen im Bereich (auch Doppelanker ohne angrenzendes Glied) */
var pfeilerIm = (b, kuerzel) => b.zaehne.filter((z) => PFEILER.test(kuerzel(z)));
//#endregion
//#region src/engine/digital.ts
/**
* Eigenlabor-Schritte des digitalen Workflows ohne BEB-Entsprechung. Den Ablauf nach Intraoralscan
* (Oralscan, CAD, Druckstumpf, Sintern …) plant abformung.ts mit den BEB-Standardpositionen;
* D101–D103 bleiben nur, damit ältere Pläne ihren Preis behalten. D106–D108: digitale Totalprothese.
*/
var DIGITAL = {
	daten: "D101",
	stumpf: "D102",
	artikulation: "D103",
	scanbody: "D104",
	anprobe: "D105",
	aufstellung: "D106",
	einsetzen: "D107",
	anprobeProthese: "D108"
};
var DIGITAL_KATALOG = [
	{
		nr: DIGITAL.daten,
		text: "Intraoralscan-Daten übernehmen, auf Vollständigkeit prüfen und für die Konstruktion aufbereiten (je Auftrag)",
		preis: 14
	},
	{
		nr: DIGITAL.stumpf,
		text: "Virtueller Stumpf: segmentieren, Präparationsgrenze festlegen, Zementspalt definieren (je Stumpf)",
		preis: 6.5
	},
	{
		nr: DIGITAL.artikulation,
		text: "Virtuelle Artikulation: Kieferrelation über Bukkalscan zuordnen, Okklusion im virtuellen Artikulator einstellen (je Auftrag)",
		preis: 14.5
	},
	{
		nr: DIGITAL.scanbody,
		text: "Scanbody-Matching: Implantatposition aus der Herstellerbibliothek zuordnen und prüfen (je Implantat)",
		preis: 9.5
	},
	{
		nr: DIGITAL.anprobe,
		text: "Anprobe gedruckt (Try-in aus Kunststoff) zur Passungs- und Ästhetikkontrolle (je Einheit)",
		preis: 9.5
	},
	{
		nr: DIGITAL.aufstellung,
		text: "CAD: Prothesenzähne virtuell aufstellen, Okklusion und Basis konstruieren (je Kiefer)",
		preis: 65
	},
	{
		nr: DIGITAL.einsetzen,
		text: "Prothesenzähne in die gefräste bzw. gedruckte Basis einsetzen, ausarbeiten und polieren (je Kiefer)",
		preis: 55
	},
	{
		nr: DIGITAL.anprobeProthese,
		text: "Anprobeprothese gedruckt (Try-in der CAD-Aufstellung, je Kiefer)",
		preis: 45
	}
];
/** BEB-Positionen des digitalen Ablaufs nach Intraoralscan (Standardpositionen jeder BEB-Liste) */
var DIGITAL_BEB = {
	oralscan: "0007",
	praepFreilegen: "0013",
	druckstumpf: "0017",
	sintern: "0032",
	auftragsdaten: "0901",
	registrierung: "0902",
	segmentierung: "0903",
	segment: "0904",
	praepgrenze: "0905",
	glanzbrand: "0906",
	krone: "0907",
	glied: "0908",
	kauflaeche: "0909",
	verbinder: "0910",
	nacharbeiten: "0911"
};
DIGITAL.daten, DIGITAL.stumpf, DIGITAL.artikulation;
/** Eigener Katalog der Praxis zuerst; fehlende Schritte des digitalen Workflows mit Standardpreis */
function mitDigital(katalog) {
	const eigene = katalog ?? [];
	return [...eigene, ...DIGITAL_KATALOG.filter((d) => !eigene.some((e) => e.nr.trim() === d.nr))];
}
//#endregion
//#region src/engine/material.ts
var MATERIAL_STAND = "05.10.2026";
var WERKSTOFFE = {
	nem: {
		titel: "NEM-Legierung (Kobalt-Chrom)",
		kurz: "NEM",
		art: "metall",
		preis: .85,
		dichte: .5,
		quelle: "Wirobond C/SG/280, Remanium 2000+/2001: 0,58–1,00 €/g"
	},
	goldreduziert: {
		titel: "Goldreduzierte Edelmetalllegierung",
		kurz: "Gold reduziert",
		art: "metall",
		preis: 105,
		dichte: .82,
		quelle: "C.Hafner Aurumed, DiGOLD Nettogold, Wegold Eco-SG: 86–114 €/g"
	},
	hochgold: {
		titel: "Hochgoldlegierung (Au ≥ 75 %)",
		kurz: "Hochgold",
		art: "metall",
		preis: 140,
		dichte: 1,
		quelle: "Tagespreise Trendgold, DiGOLD, Wegold, C.Hafner, Goldquadrat: 113–166 €/g (Feingold ca. 119 €/g)"
	},
	zirkon: {
		titel: "Zirkonoxid",
		kurz: "Zirkon",
		art: "keramik",
		preis: 15,
		quelle: "Multilayer-Ronden 85–205 € netto, anteilig 12–18 € je Einheit"
	},
	presskeramik: {
		titel: "Presskeramik (Lithiumdisilikat, z. B. e.max Press)",
		kurz: "Presskeramik",
		art: "keramik",
		preis: 17.5,
		quelle: "IPS e.max Press Rohling 15,29–19,47 € je Stück"
	},
	lithiumdisilikat: {
		titel: "Lithiumdisilikat gefräst (z. B. e.max CAD)",
		kurz: "LiSi CAD",
		art: "keramik",
		preis: 29.5,
		quelle: "IPS e.max CAD Block 28,47–30,67 € je Stück"
	}
};
var EINHEIT_TITEL = {
	krone: "Krone",
	teilkrone: "Teilkrone",
	verblendkrone: "Verblendkrone (Gerüst)",
	glied: "Brückenglied",
	anker: "Klebebrückenanker",
	teleskop: "Teleskop",
	sekundaerteleskop: "Sekundärteleskop",
	veneer: "Veneer"
};
/** mittlerer Legierungsverbrauch in Gramm bei Hochgold, je Einheit */
var GRAMM = {
	krone: 2.5,
	teilkrone: 1.8,
	verblendkrone: 1.5,
	glied: 3,
	anker: 1.2,
	teleskop: 3.5,
	sekundaerteleskop: 2,
	veneer: 0
};
/** BEL-Einheiten, für die der NEM-Verarbeitungsaufwand (L-Nr. 970 0) angesetzt ist */
var NEM_AUFWAND_BEL = /* @__PURE__ */ new Set([
	"1021",
	"1022",
	"1024",
	"1100"
]);
/** Laborpositionen, die eine Einheit mit Legierung bzw. Keramik festlegen */
var EINHEITEN = {
	"BEL 1021": {
		art: "metall",
		einheit: "krone"
	},
	"BEL 1022": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEL 1024": {
		art: "metall",
		einheit: "verblendkrone"
	},
	"BEL 1100": {
		art: "metall",
		einheit: "glied"
	},
	"BEL 1200": {
		art: "metall",
		einheit: "teleskop"
	},
	"BEL 1201": {
		art: "metall",
		einheit: "sekundaerteleskop"
	},
	"BEB 2101": {
		art: "metall",
		einheit: "krone"
	},
	"BEB 2104": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2121": {
		art: "metall",
		einheit: "verblendkrone"
	},
	"BEB 2126": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2155": {
		art: "metall",
		einheit: "anker"
	},
	"BEB 2361": {
		art: "metall",
		einheit: "glied"
	},
	"BEB 3001": {
		art: "metall",
		einheit: "teleskop"
	},
	"BEB 2281": {
		art: "keramik",
		einheit: "krone"
	},
	"BEB 2251": {
		art: "keramik",
		einheit: "krone"
	},
	"BEB 2252": {
		art: "keramik",
		einheit: "krone"
	},
	"BEB 2301": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2302": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2303": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2304": {
		art: "metall",
		einheit: "teilkrone"
	},
	"BEB 2551": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2552": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2553": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2554": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2351": {
		art: "keramik",
		einheit: "glied"
	},
	"BEB 2534": {
		art: "keramik",
		einheit: "teilkrone"
	},
	"BEB 2653": {
		art: "keramik",
		einheit: "veneer"
	}
};
var WERKSTOFFE_FUER = {
	metall: [
		"nem",
		"goldreduziert",
		"hochgold"
	],
	keramik: [
		"zirkon",
		"presskeramik",
		"lithiumdisilikat"
	]
};
/** Einheiten mit Kronenmaterial je Zahn aus den Laborpositionen (erste festlegende Position je Zahn) */
function kronenEinheiten(positionen) {
	const out = /* @__PURE__ */ new Map();
	for (const p of positionen) {
		const nr = p.nr.replace(/\s/g, "");
		const e = EINHEITEN[`${p.ebene} ${nr}`];
		const zahn = p.zahn.trim();
		if (!e || !/^\d\d$/.test(zahn) || out.has(zahn)) continue;
		out.set(zahn, {
			zahn,
			...e,
			ebene: p.ebene,
			nr,
			labor: p.labor
		});
	}
	return [...out.values()].sort((a, b) => a.zahn.localeCompare(b.zahn));
}
function standardWerkstoff(e) {
	if (e.art === "metall") return "nem";
	return e.einheit === "teilkrone" || e.einheit === "veneer" ? "presskeramik" : "zirkon";
}
/** gewählter Werkstoff, sofern er zur Einheit passt – sonst der Standard */
function werkstoffVon(e, wahl) {
	const w = wahl[e.zahn];
	return w && WERKSTOFFE_FUER[e.art].includes(w) ? {
		werkstoff: w,
		gewaehlt: true
	} : {
		werkstoff: standardWerkstoff(e),
		gewaehlt: false
	};
}
var runden$1 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
var zahl = (n, s = 2) => n.toLocaleString("de-DE", {
	minimumFractionDigits: s,
	maximumFractionDigits: s
});
/** geschätzte Menge und Kosten einer Einheit */
function materialSchaetzung(e, w) {
	const info = WERKSTOFFE[w];
	if (info.art === "keramik") return {
		menge: 1,
		betrag: info.preis
	};
	const menge = Math.round(GRAMM[e.einheit] * (info.dichte ?? 1) * 10 + 1e-9) / 10;
	return {
		menge,
		betrag: runden$1(menge * info.preis)
	};
}
function materialErmitteln(positionen, wahl) {
	const zeilen = [];
	const offen = [];
	const edelBel = [];
	let nemAufwand = 0;
	const lisiGlied = [];
	for (const e of kronenEinheiten(positionen)) {
		const { werkstoff: w, gewaehlt } = werkstoffVon(e, wahl);
		const info = WERKSTOFFE[w];
		if (!gewaehlt) offen.push(`${e.zahn} ${info.kurz}`);
		if (e.einheit === "glied" && (w === "presskeramik" || w === "lithiumdisilikat") && /[678]$/.test(e.zahn)) lisiGlied.push(e.zahn);
		if (e.ebene === "BEL" && w === "nem") continue;
		if (e.ebene === "BEL" && info.art === "metall") {
			edelBel.push(e.zahn);
			if (NEM_AUFWAND_BEL.has(e.nr)) nemAufwand++;
		}
		const { menge, betrag } = materialSchaetzung(e, w);
		zeilen.push({
			zahn: e.zahn,
			werkstoff: w,
			menge,
			einzel: info.preis,
			betrag,
			labor: e.labor,
			text: info.art === "metall" ? `${info.titel}, ${EINHEIT_TITEL[e.einheit]}: ca. ${zahl(menge, 1)} g à ${zahl(info.preis)} €/g (mittlerer Tagespreis)` : `${info.titel}, ${EINHEIT_TITEL[e.einheit]}: Rohling anteilig (Mittelwert)`
		});
	}
	const hinweise = [];
	if (offen.length) hinweise.push(`Kronenmaterial nicht gewählt (${offen.join(", ")}) – angenommen und mit Mittelwert berechnet. Unter „Kronenmaterial“ festlegen.`);
	if (edelBel.length) hinweise.push(`Edelmetall statt NEM an ${edelBel.join(", ")}: Legierung wird zusätzlich berechnet${nemAufwand ? ", der NEM-Verarbeitungsaufwand (BEL 970 0) entfällt dort" : ""}; im Härtefall übernimmt die Kasse nur NEM.`);
	if (zeilen.some((z) => z.werkstoff === "goldreduziert" || z.werkstoff === "hochgold")) hinweise.push(`Edelmetall geschätzt mit mittlerem Verbrauch und Tagespreis (Stand ${MATERIAL_STAND}) – abgerechnet werden Gewicht und Tagespreis am Verarbeitungstag (§ 10 Abs. 2 Nr. 5 GOZ).`);
	if (lisiGlied.length) hinweise.push(`Lithiumdisilikat-Brückenglied an ${lisiGlied.join(", ")}: nur bis zum zweiten Prämolaren freigegeben – im Molarenbereich Zirkonoxid wählen.`);
	return {
		zeilen,
		edelmetallBel: nemAufwand,
		edelmetallKasse: edelBel,
		hinweise
	};
}
//#endregion
//#region src/engine/planung.ts
/** Kieferhälfte bzw. Frontzahnbereich im Sinne der GOZ (13–23 und 33–43 = Frontzahnbereich) */
function bereich$1(zahn) {
	if (Number(zahn[1]) <= 3) return zahn[0] === "1" || zahn[0] === "2" ? "OK-Front" : "UK-Front";
	return {
		"1": "OK rechts",
		"2": "OK links",
		"3": "UK links",
		"4": "UK rechts"
	}[zahn[0]] ?? zahn[0];
}
/**
* Rein private Planung: Befund und Planung je Zahn werden direkt in GOZ-Honorar und BEB-Laborleistungen
* übersetzt – ohne Regelversorgung, Festzuschüsse, BEMA oder BEL II.
*/
/** Planungskürzel → GOZ (Krone; `anker` als Brücken-/Prothesenanker) und BEB-Laborleistungen */
var ZUORDNUNG = {
	K: {
		goz: "2210",
		anker: "5010",
		beb: ["2101"]
	},
	KV: {
		goz: "2210",
		anker: "5010",
		beb: ["2121", "2611"]
	},
	KM: {
		goz: "2210",
		anker: "5010",
		beb: ["2281", "2612"]
	},
	KH: {
		goz: "2210",
		anker: "5010",
		beb: ["2101"]
	},
	KVH: {
		goz: "2210",
		anker: "5010",
		beb: ["2121", "2611"]
	},
	KMH: {
		goz: "2210",
		anker: "5010",
		beb: ["2281", "2612"]
	},
	KO: {
		goz: "2210",
		anker: "5010",
		beb: ["2101", "3023"]
	},
	KVO: {
		goz: "2210",
		anker: "5010",
		beb: [
			"2121",
			"2611",
			"3023"
		]
	},
	KMO: {
		goz: "2210",
		anker: "5010",
		beb: [
			"2281",
			"2612",
			"3023"
		]
	},
	PK: {
		goz: "2220",
		beb: ["2104"]
	},
	PKV: {
		goz: "2220",
		beb: ["2126", "2611"]
	},
	PKM: {
		goz: "2220",
		beb: ["2534"]
	},
	VE: {
		goz: "2220",
		beb: [
			"0833",
			"2653",
			"2951"
		]
	},
	ZA: {
		goz: "2210",
		anker: "5010",
		beb: ["2251"]
	},
	ZAB: {
		goz: "",
		beb: ["2351"]
	},
	I1: {
		goz: "2150",
		beb: ["2301"]
	},
	I2: {
		goz: "2160",
		beb: ["2302"]
	},
	I3: {
		goz: "2170",
		beb: ["2303"]
	},
	I4: {
		goz: "2170",
		beb: ["2304"]
	},
	C1: {
		goz: "2150",
		beb: ["2551"]
	},
	C2: {
		goz: "2160",
		beb: ["2552"]
	},
	C3: {
		goz: "2170",
		beb: ["2553"]
	},
	C4: {
		goz: "2170",
		beb: ["2554"]
	},
	ON: {
		goz: "2170",
		beb: ["2304"]
	},
	ONK: {
		goz: "2170",
		beb: ["2554"]
	},
	VEK: {
		goz: "2220",
		beb: [
			"0833",
			"2663",
			"2945"
		]
	},
	T: {
		goz: "5040",
		beb: ["3001"]
	},
	TZ: {
		goz: "5040",
		beb: ["3001", "6905"]
	},
	TZV: {
		goz: "5040",
		beb: [
			"3001",
			"6905",
			"2602"
		]
	},
	TV: {
		goz: "5040",
		beb: ["3001", "2611"]
	},
	TM: {
		goz: "5040",
		beb: ["3001", "2602"]
	},
	T2: {
		goz: "5100",
		beb: ["3001"]
	},
	T2V: {
		goz: "5100",
		beb: ["3001", "2611"]
	},
	T2M: {
		goz: "5100",
		beb: ["3001", "2602"]
	},
	ZAS: {
		goz: "2200",
		anker: "5000",
		beb: ["2251"]
	},
	SK: {
		goz: "2200",
		anker: "5000",
		beb: ["2101"]
	},
	SKV: {
		goz: "2200",
		anker: "5000",
		beb: ["2121", "2611"]
	},
	SKM: {
		goz: "2200",
		anker: "5000",
		beb: ["2281", "2612"]
	},
	SKO: {
		goz: "2200",
		anker: "5000",
		beb: ["2101", "3023"]
	},
	SKVO: {
		goz: "2200",
		anker: "5000",
		beb: [
			"2121",
			"2611",
			"3023"
		]
	},
	SKMO: {
		goz: "2200",
		anker: "5000",
		beb: [
			"2281",
			"2612",
			"3023"
		]
	},
	STZ: {
		goz: "5040",
		beb: ["3001", "6905"]
	},
	STZV: {
		goz: "5040",
		beb: [
			"3001",
			"6905",
			"2602"
		]
	},
	ST: {
		goz: "5040",
		beb: ["3001"]
	},
	STV: {
		goz: "5040",
		beb: ["3001", "2611"]
	},
	STM: {
		goz: "5040",
		beb: ["3001", "2602"]
	},
	A: {
		goz: "",
		beb: ["2155"]
	},
	ABV: {
		goz: "",
		beb: ["2361", "2611"]
	},
	ABM: {
		goz: "",
		beb: ["2351", "2612"]
	},
	B: {
		goz: "",
		beb: ["2361"]
	},
	BV: {
		goz: "",
		beb: ["2361", "2611"]
	},
	BM: {
		goz: "",
		beb: ["2351", "2612"]
	},
	SB: {
		goz: "",
		beb: ["2361"]
	},
	SBV: {
		goz: "",
		beb: ["2361", "2611"]
	},
	SBM: {
		goz: "",
		beb: ["2351", "2612"]
	}
};
var GLIED = /^(S?B|AB)[VM]?$|^ZAB$/;
var PROTHESENZAHN = /^(S?EO?|SO)$/;
var STEGZAHN = /^S?EO$/;
var GESCHIEBE = /^S?K[VM]?O$/;
var PFEILERKRONE = /^(S?K|PK|ZA$|ZAS$|S?T)/;
var IMPLANTAT = /^S(K|T|O)|^ZAS$/;
var FESTSITZEND = /^(S?K|PK|VE|ZA$|ZAS$|ZAB$|I\d|C\d|ONK?|S?B|AB|A$|R$)/;
var VENEER = /^VEK?$/;
var spanne = (z) => z.length === 1 ? z[0] : `${z[0]}-${z[z.length - 1]}`;
function bebFuer(k, b, z) {
	if (!istFrontzahn(z)) return b;
	if ((k === "ZA" || k === "ZAS") && b === "2251") return "2252";
	if (k === "ZAB" && b === "2351") return "2352";
	return b;
}
/** Kieferhälften und Frontzahnbereiche für die optisch-elektronische Abformung (GOZ 0065) */
function scanBereich(zahn) {
	if (istFrontzahn(zahn)) return kieferVon(zahn) === "OK" ? "OK-Front" : "UK-Front";
	return `Q${zahn[0]}`;
}
var STANDARD_IMPLANTAT = {
	system: "durchschnitt",
	loeffel: "geschlossen",
	abutment: "standard"
};
/** Befund ohne eigenen Zahn an der Stelle (fehlt, ersetzt, Brückenglied, Implantat) */
var OHNE_ZAHN$1 = /* @__PURE__ */ new Set([
	"f",
	"e",
	"ew",
	"b",
	"bw",
	"ab",
	"abw",
	"i",
	"ix",
	"sb",
	"sbw",
	"se",
	"sew",
	"sk",
	"skw",
	"so",
	"sow",
	"st",
	"stw",
	")("
]);
/** Befund mit eigenem, erhaltenem Zahn */
var EIGENER_ZAHN = /* @__PURE__ */ new Set([
	"",
	"k",
	"kw",
	"pkw",
	"pw",
	"ww",
	"t",
	"tw",
	"t2w",
	"a",
	"aw",
	"ur"
]);
/** Planung, die einen eigenen Zahn voraussetzt: Krone, Teilkrone, Veneer, Teleskop, Adhäsivanker */
var AUF_EIGENEM_ZAHN = /^(K|PK|VE|T|A$)/;
/** Passt die Planung zum Befund (01)? Ohne eingetragenen Befund wird nichts geprüft. */
function befundAbgleich(geplant, B, P) {
	if (![...OBERKIEFER, ...UNTERKIEFER].some((z) => B(z))) return [];
	const aus = [];
	for (const z of geplant) {
		const b = B(z), k = P(z);
		if (AUF_EIGENEM_ZAHN.test(k) && OHNE_ZAHN$1.has(b)) aus.push(`Zahn ${z}: laut Befund „${b}“ steht dort kein eigener Zahn – „${k}“ braucht einen; Brückenglied (B…) oder Implantatkrone (SK…) planen.`);
		else if (AUF_EIGENEM_ZAHN.test(k) && b === "x") aus.push(`Zahn ${z}: laut Befund nicht erhaltungswürdig – „${k}“ auf diesem Zahn prüfen.`);
		if (IMPLANTAT.test(k) && EIGENER_ZAHN.has(b)) aus.push(`Zahn ${z}: Implantatversorgung geplant, laut Befund steht dort ein eigener Zahn (${b || "vorhanden"}) – Befund prüfen.`);
		if (GLIED.test(k) && EIGENER_ZAHN.has(b)) aus.push(`Zahn ${z}: Brückenglied geplant, laut Befund ist der Zahn vorhanden (${b || "vorhanden"}) – Befund prüfen (f oder x?).`);
	}
	return aus;
}
/**
* `abformung`: präparierte Zähne bzw. Primärkronen;
* `prothese`: zweite Abformung für den herausnehmbaren Teil einer Kombinationsarbeit (eigene Sitzung)
*/
function planen(zaehne, abformung, implantat = STANDARD_IMPLANTAT, prothese = "") {
	const positionen = [];
	const hinweise = [];
	const gezaehlt = /* @__PURE__ */ new Map();
	const pos = (ebene, nr, zahn, anzahl = 1, extra = {}) => {
		const basis = `auto:${ebene}:${nr}:${zahn}`;
		const n = (gezaehlt.get(basis) ?? 0) + 1;
		gezaehlt.set(basis, n);
		positionen.push({
			id: n > 1 ? `${basis}#${n}` : basis,
			ebene,
			nr,
			zahn,
			anzahl,
			auto: true,
			...extra
		});
	};
	const B = (z) => (zaehne[z]?.B ?? "").trim().toLowerCase();
	const P = (z) => (zaehne[z]?.TP ?? "").trim().toUpperCase();
	const geplant = [...OBERKIEFER, ...UNTERKIEFER].filter((z) => P(z));
	if (!geplant.length) return {
		positionen,
		hinweise: ["Noch keine Planung eingetragen – Kürzel in der Zeile „Planung“ eintragen (z. B. KM, BM, SK, T, E)."]
	};
	for (const z of geplant) if (P(z) !== ")(" && !ZUORDNUNG[P(z)] && !PROTHESENZAHN.test(P(z)) && !["H", "R"].includes(P(z))) hinweise.push(`Kürzel „${P(z)}“ an Zahn ${z} ist unbekannt.`);
	hinweise.push(...befundAbgleich(geplant, B, P));
	pos("GOZ", "0030", "");
	const kieferMitArbeit = [];
	const festsitzendKiefer = /* @__PURE__ */ new Set();
	const scanBereiche = /* @__PURE__ */ new Set();
	const scanKiefer = /* @__PURE__ */ new Set();
	/** gescannte präparierte Zähne (ohne Implantate) für den digitalen Workflow */
	const stuempfe = [];
	/** Kiefer mit herausnehmbarem Teil; true = zahnlos (Funktionsabformung GOZ 5180/5190 schon enthalten) */
	const herausnehmbar = /* @__PURE__ */ new Map();
	for (const [kiefer, reihe] of [["OK", OBERKIEFER], ["UK", UNTERKIEFER]]) {
		if (!reihe.some((z) => P(z))) continue;
		kieferMitArbeit.push(kiefer);
		const sitz = reihe.filter((z) => P(z) !== ")(" && B(z) !== ")(");
		const zahnlos = sitz.filter((z) => !istWeisheitszahn(z)).every((z) => [
			"f",
			"x",
			"e",
			"ew",
			"se",
			"sew"
		].includes(B(z)) || PROTHESENZAHN.test(P(z)) || IMPLANTAT.test(P(z)));
		const laeufe = (f) => {
			const out = [];
			let akt = [];
			sitz.forEach((z, i) => {
				if (f(z)) akt.push(z);
				if ((!f(z) || i === sitz.length - 1) && akt.length) {
					out.push({
						zaehne: akt,
						links: sitz[sitz.indexOf(akt[0]) - 1],
						rechts: sitz[sitz.indexOf(akt[akt.length - 1]) + 1]
					});
					akt = [];
				}
			});
			return out;
		};
		const istPfeiler = (x) => !!x && (PFEILERKRONE.test(P(x)) || P(x) === "A");
		const markiert = brueckenBereiche(reihe, P, (z) => zaehne[z]).filter((b) => b.explizit);
		const bruecken = laeufe((z) => GLIED.test(P(z))).map((l) => {
			const m = markiert.find((b) => l.zaehne.every((z) => b.zaehne.includes(z)));
			return {
				...l,
				anker: m ? pfeilerIm(m, P) : [l.links, l.rechts].filter(istPfeiler)
			};
		});
		const brueckenAnker = new Set(bruecken.flatMap((b) => b.anker));
		const stege = laeufe((z) => STEGZAHN.test(P(z)));
		const stegAnker = new Set(stege.flatMap((s) => [s.links, s.rechts]).filter((x) => !!x));
		const prothesenZaehne = sitz.filter((z) => PROTHESENZAHN.test(P(z)) && P(z) !== "SO");
		for (const b of bruecken) if (!b.anker.length) hinweise.push(`Brückenglied ${spanne(b.zaehne)} ohne Brückenanker – Planung prüfen.`);
		else if (b.anker.length === 1) hinweise.push(`Brücke ${spanne(b.zaehne)}: Freiendbrücke mit nur einem Anker (${b.anker[0]}) – bitte prüfen.`);
		for (const z of sitz) {
			const k = P(z);
			if (!k || k === ")(") continue;
			if (FESTSITZEND.test(k) && !GLIED.test(k)) festsitzendKiefer.add(kiefer);
			if (abformung === "scan" && (FESTSITZEND.test(k) && !GLIED.test(k) || /^S?T/.test(k))) {
				scanBereiche.add(scanBereich(z));
				scanKiefer.add(kiefer);
				if (!IMPLANTAT.test(k)) stuempfe.push(z);
			}
			if (ALTE_KRONE.has(B(z)) && k !== ")(") pos("GOZ", "2290", z);
			if (B(z) === "ww" && PFEILERKRONE.test(k) && !IMPLANTAT.test(k)) pos("GOZ", "2180", z);
			if (B(z) === "x") hinweise.push(`Zahn ${z} ist nicht erhaltungswürdig – die Entfernung (GOZ 3000 ff.) und ggf. eine Sofortversorgung sind nicht enthalten.`);
			if (IMPLANTAT.test(k)) pos("GOZ", "9050", z, 2);
			if (k === "R") {
				pos("GOZ", "5030", z);
				if (!stegAnker.has(z)) pos("BEB", "2181", z);
				continue;
			}
			const zuo = ZUORDNUNG[k];
			if (!zuo) continue;
			const goz = (brueckenAnker.has(z) || GESCHIEBE.test(k) || stegAnker.has(z) || prothesenZaehne.length > 0 && /^S?T/.test(k)) && zuo.anker ? zuo.anker : zuo.goz;
			if (goz) pos("GOZ", goz, z);
			for (const b of zuo.beb) pos("BEB", bebFuer(k, b, z), z);
			if (/^(TM|STM|T2M|TZV|STZV)$/.test(k) && !hinweise.some((h) => h.startsWith("Vollverblendete Teleskope"))) hinweise.push("Vollverblendete Teleskope: Verblendung aus Kunststoff (Komposite, BEB 2602). Keramik platzt beim Aufsetzen durch die Spannung ab.");
			if (VENEER.test(k)) pos("GOZ", "2197", z);
			if (GESCHIEBE.test(k)) pos("GOZ", "5080", z);
			if (PFEILERKRONE.test(k)) pos("GOZ", brueckenAnker.has(z) ? "5120" : "2270", z);
		}
		for (const b of bruecken) {
			const zahn = spanne(b.zaehne);
			if (b.anker.some((a) => P(a) === "A")) pos("GOZ", "5150", zahn);
			else pos("GOZ", "5070", zahn);
			if (b.anker.some((a) => P(a) !== "A")) pos("GOZ", "5140", zahn);
		}
		for (const s of stege) {
			const zahn = spanne(s.zaehne);
			pos("GOZ", "5070", zahn);
			pos("GOZ", "5080", zahn);
			pos("BEB", "3031", zahn);
			pos("BEB", "3032", zahn, s.zaehne.length);
		}
		for (const x of stegAnker) if (P(x) === "SO") {
			pos("GOZ", "5030", x);
			pos("BEB", "2035", x);
		}
		const einzelanker = sitz.filter((z) => P(z) === "SO" && !stegAnker.has(z));
		for (const z of einzelanker) {
			pos("GOZ", "5030", z);
			pos("GOZ", "5080", z);
			pos("BEB", "3027", z);
		}
		if (prothesenZaehne.length || stege.length || einzelanker.length) herausnehmbar.set(kiefer, zahnlos && prothesenZaehne.length > 0);
		if (prothesenZaehne.length) {
			const n = prothesenZaehne.length;
			if (zahnlos) {
				pos("GOZ", kiefer === "OK" ? "5220" : "5230", kiefer);
				pos("GOZ", kiefer === "OK" ? "5180" : "5190", kiefer);
				pos("BEB", "6001", kiefer);
				pos("BEB", "6002", kiefer, n);
				pos("BEB", "6301", kiefer);
				pos("BEB", "6302", kiefer, n);
			} else {
				pos("GOZ", "5210", kiefer);
				pos("GOZ", "5170", kiefer);
				pos("BEB", "4001", kiefer);
				pos("BEB", "6001", kiefer);
				pos("BEB", "6003", kiefer, n);
				pos("BEB", "6311", kiefer);
				pos("BEB", "6312", kiefer, n);
			}
			if (sitz.some((z) => /H$/.test(P(z)))) hinweise.push(`${kiefer}: Halteelemente (H) – Klammern/Auflagen sind im Modellguss enthalten, gesonderte Halteelemente ggf. ergänzen.`);
		}
	}
	if (!abformung) hinweise.push("Abformung noch offen – Intraoralscan oder Abdruck wählen. Bis dahin fehlen die Modelle und ggf. GOZ 0065.");
	else for (const kiefer of ["OK", "UK"]) {
		const eigene = kieferMitArbeit.includes(kiefer);
		if (abformung === "scan") {
			if (eigene || festsitzendKiefer.size || scanKiefer.size) pos("BEB", "0009", kiefer);
		} else if (festsitzendKiefer.has(kiefer)) pos("BEB", "0021", kiefer);
		else if (eigene || festsitzendKiefer.size) pos("BEB", "0002", kiefer);
	}
	if (abformung === "scan" && scanBereiche.size) {
		const gegenkiefer = ["OK", "UK"].filter((k) => !scanKiefer.has(k)).length;
		pos("GOZ", "0065", "", scanBereiche.size + gegenkiefer);
	}
	const impScan = abformung === "scan" ? [...OBERKIEFER, ...UNTERKIEFER].filter((z) => IMPLANTAT.test(P(z))) : [];
	const digital = abformung === "scan" ? digitalerAblauf(positionen, pos, stuempfe, impScan, geplant.filter((z) => VENEER.test(P(z)))) : "";
	if (digital && herausnehmbar.size) pos("BEB", "0402", "");
	else if (!digital && kieferMitArbeit.length) pos("BEB", "0402", "");
	if (digital) hinweise.push(`${digital}${herausnehmbar.size ? " Der Mittelwertartikulator bleibt für die Aufstellung des herausnehmbaren Teils." : ""}`);
	if (geplant.some((z) => VENEER.test(P(z)))) pos("BEB", "0723", "");
	const zweite = [...herausnehmbar].filter(([, zahnlos]) => !zahnlos).map(([k]) => k);
	const zahnloseKiefer = [...herausnehmbar].filter(([, zahnlos]) => zahnlos).map(([k]) => k);
	if (zahnloseKiefer.length && prothese) hinweise.push(`${zahnloseKiefer.join(", ")} zahnlos: die Funktionsabformung (GOZ 5180/5190) ist in der Prothese enthalten – keine zweite Abformung berechnet.`);
	if (!prothese) {
		if (zweite.length && abformung) hinweise.push(`Herausnehmbarer Teil ${zweite.join(", ")}: zweite Abformung (Scan oder Überabdruck) noch offen – unter „Abformung“ Schritt 2 wählen.`);
	} else if (!zweite.length) {
		if (!zahnloseKiefer.length) hinweise.push("Zweite Abformung gewählt, aber kein herausnehmbarer Teil geplant – sie bringt keine zusätzlichen Leistungen.");
	} else if (prothese === "scan") {
		for (const k of zweite) {
			pos("GOZ", "0065", k, 3, { text: `Optisch-elektronische Abformung (2. Sitzung, herausnehmbarer Teil ${k}), je Kieferhälfte/Frontzahnbereich` });
			pos("BEB", "0009", k);
		}
		hinweise.push(`Zweiter Intraoralscan für den herausnehmbaren Teil ${zweite.join(", ")} in eigener Sitzung: GOZ 0065 erneut je Kieferhälfte/Frontzahnbereich (3 je Kiefer) und gedrucktes Modell (BEB 0009).`);
	} else {
		for (const k of zweite) {
			if (!positionen.some((p) => p.ebene === "GOZ" && p.nr === "5170" && p.zahn === k)) pos("GOZ", "5170", k);
			pos("BEB", "1006", k);
			pos("BEB", "0004", k);
		}
		hinweise.push(`Überabdruck für den herausnehmbaren Teil ${zweite.join(", ")} mit individuellem Löffel (GOZ 5170, BEB 1006) und Modell nach Überabformung (BEB 0004).`);
	}
	const imp = [...OBERKIEFER, ...UNTERKIEFER].filter((z) => IMPLANTAT.test(P(z)));
	if (imp.length) {
		const sys = implantatsystem(implantat.system);
		const mat = (k, zahn) => pos("MAT", `MAT-${k}`, zahn, 1, {
			text: `${sys.hersteller} ${sys.system}: ${KOMPONENTEN[k]}`,
			preis: sys.preise[k]
		});
		const kiefer = [...new Set(imp.map(kieferVon))];
		if (abformung === "scan") {
			for (const k of kiefer) pos("BEB", "0018", k);
			for (const z of imp) {
				pos("BEB", "0224", z);
				mat("scanbody", z);
				mat("laboranalog", z);
			}
		} else if (abformung === "abdruck") {
			if (implantat.loeffel === "offen") for (const k of kiefer) {
				if (!positionen.some((p) => p.ebene === "GOZ" && p.nr === "5170" && p.zahn === k)) pos("GOZ", "5170", k);
				pos("BEB", "1108", k);
			}
			for (const k of kiefer) pos("BEB", "0018", k);
			for (const z of imp) {
				pos("BEB", "0225", z);
				mat("abdruckpfosten", z);
				mat("laboranalog", z);
			}
		} else hinweise.push(`Implantat ${imp.join(", ")}: Abformung noch offen – Abformteile (Scanbody bzw. Abformpfosten) fehlen.`);
		for (const h of new Set(imp.map(bereich$1))) pos("BEB", "0223", h);
		for (const z of imp) if (implantat.abutment === "standard" || P(z) === "SO") {
			pos("BEB", "4421", z);
			mat("abutmentStandard", z);
		} else {
			pos("BEB", implantat.abutment === "keramik" ? "6906" : "2033", z);
			mat("tiBase", z);
			mat("schraube", z);
		}
		if (sys.genau !== "ja") hinweise.push(`Implantatteile ${sys.hersteller} ${sys.system}: Preise ${sys.genau === "teilweise" ? "teilweise " : ""}geschätzt (Stand ${sys.stand}) – mit der aktuellen Preisliste abgleichen.`);
		hinweise.push("Chirurgische Implantatleistungen (Implantation GOZ 9000 ff., Augmentation) sind nicht enthalten und gesondert zu planen.");
	}
	return {
		positionen,
		hinweise
	};
}
var INLAY_BEB = /^(230[1-4]|255[1-9]|2560)$/;
var KERAMIK_INLAY = /^(255[1-9]|2560)$/;
/** Verbinder je Brücke: zwischen den Gliedern und zu jedem Anker daneben */
function verbinder(glieder, anker) {
	const out = [];
	for (const reihe of [OBERKIEFER, UNTERKIEFER]) {
		let lauf = [];
		const ende = () => {
			if (!lauf.length) return;
			const a = lauf[0];
			const b = lauf[lauf.length - 1];
			const links = anker.has(reihe[a - 1] ?? "");
			const rechts = anker.has(reihe[b + 1] ?? "");
			const n = lauf.length - 1 + Number(links) + Number(rechts);
			if (n > 0) out.push({
				zahn: `${reihe[links ? a - 1 : a]}-${reihe[rechts ? b + 1 : b]}`,
				anzahl: n
			});
			lauf = [];
		};
		reihe.forEach((z, i) => glieder.includes(z) ? lauf.push(i) : ende());
		ende();
	}
	return out;
}
/**
* Digitaler Ablauf im Labor nach Intraoralscan, wie im HKP mit den BEB-Standardpositionen: je Auftrag Oralscan
* aufbereiten, CAD-Auftragsdaten und optisch digitale Registrierung statt Mittelwertartikulator; je Arbeitskiefer
* Modellsegmentierung; je präpariertem Zahn Präp freilegen, Druckstumpf, Segment und Präpgrenze; CAD-Konstruktion je
* Krone, Kaufläche (Teilkrone/Inlay) bzw. Brückenglied mit Verbindern und CAM-Nacharbeit je Element; je Keramikeinheit
* Sintern (nur Zirkon, die Berechnung streicht es bei anderem Werkstoff) und Glanz-/Kristallisationsbrand.
* Steckartikulator (BEB 0401) nur bei Verblendung. Liefert den Hinweis, leer ohne Element.
*/
function digitalerAblauf(positionen, pos, stuempfe, implantate, veneers) {
	const zahnLabor = positionen.filter((p) => p.ebene === "BEB" && /^\d\d$/.test(p.zahn));
	const alle = kronenEinheiten(zahnLabor).filter((e) => e.einheit !== "sekundaerteleskop");
	const einheiten = alle.filter((e) => e.einheit !== "veneer" && !veneers.includes(e.zahn));
	const einheit = new Map(einheiten.map((e) => [e.zahn, e]));
	const inlays = [...new Set(zahnLabor.filter((p) => INLAY_BEB.test(p.nr)).map((p) => p.zahn))].filter((z) => !einheit.has(z)).sort();
	const kronen = [.../* @__PURE__ */ new Set([...einheiten.filter((e) => e.einheit !== "glied" && e.einheit !== "teilkrone").map((e) => e.zahn), ...stuempfe.filter((z) => !einheit.has(z) && !inlays.includes(z) && !veneers.includes(z))])].sort();
	const kauflaechen = [
		...einheiten.filter((e) => e.einheit === "teilkrone").map((e) => e.zahn),
		...inlays,
		...veneers
	].sort();
	const glieder = einheiten.filter((e) => e.einheit === "glied").map((e) => e.zahn);
	const keramik = [...alle.filter((e) => e.art === "keramik").map((e) => e.zahn), ...inlays.filter((z) => zahnLabor.some((p) => p.zahn === z && KERAMIK_INLAY.test(p.nr)))].sort();
	const elemente = [
		...kronen,
		...kauflaechen,
		...glieder
	];
	if (!elemente.length && !implantate.length) return "";
	const D = DIGITAL_BEB;
	const bruecken = verbinder(glieder, /* @__PURE__ */ new Set([...kronen, ...kauflaechen]));
	const verblendet = zahnLabor.some((p) => /^26\d\d$/.test(p.nr) && (elemente.includes(p.zahn) || implantate.includes(p.zahn)));
	pos("BEB", D.oralscan, "", 1, { text: "Oralscan aufbereiten" });
	pos("BEB", D.auftragsdaten, "");
	pos("BEB", D.registrierung, "");
	for (const k of new Set([...elemente, ...implantate].map(kieferVon))) pos("BEB", D.segmentierung, k);
	for (const z of stuempfe) for (const nr of [
		D.praepFreilegen,
		D.druckstumpf,
		D.segment,
		D.praepgrenze
	]) pos("BEB", nr, z);
	for (const z of kronen) pos("BEB", D.krone, z);
	for (const z of kauflaechen) pos("BEB", D.kauflaeche, z);
	for (const z of glieder) pos("BEB", D.glied, z);
	for (const b of bruecken) pos("BEB", D.verbinder, b.zahn, b.anzahl);
	for (const z of elemente) pos("BEB", D.nacharbeiten, z);
	for (const z of keramik) {
		pos("BEB", D.sintern, z);
		pos("BEB", D.glanzbrand, z);
	}
	for (const z of implantate) pos("BEB", DIGITAL.scanbody, z);
	if (verblendet) pos("BEB", "0401", "");
	const anzahl = (n, eins, mehr) => `${n} ${n > 1 ? mehr : eins}`;
	return `Digitaler Ablauf im Labor nach Intraoralscan: ${[
		"Oralscan aufbereiten, CAD-Auftragsdaten und digitale Registrierung statt Mittelwertartikulator",
		stuempfe.length && `Präp freilegen, Druckstumpf, Segment und Präpgrenze je Stumpf (${stuempfe.join(", ")})`,
		`CAD-Konstruktion ${[
			kronen.length && anzahl(kronen.length, "Krone", "Kronen"),
			kauflaechen.length && anzahl(kauflaechen.length, "Kaufläche", "Kauflächen"),
			glieder.length && anzahl(glieder.length, "Brückenglied", "Brückenglieder")
		].filter(Boolean).join(", ") || "Implantatversorgung"} mit CAM-Nacharbeit`,
		bruecken.length && `Verbinder ${bruecken.map((b) => b.zahn).join(", ")}`,
		keramik.length && `Sintern (Zirkon) und Glanz-/Kristallisationsbrand ${keramik.join(", ")}`,
		implantate.length && `Scanbody-Matching ${implantate.join(", ")}`,
		verblendet && "Steckartikulator für die Verblendung"
	].filter(Boolean).join("; ")}.`;
}
//#endregion
//#region src/engine/begruendung.ts
/**
* Standardbegründungen für GOZ-Faktoren über dem Schwellenwert 2,3 (§ 10 Abs. 3 GOZ).
* Sie müssen sich auf Schwierigkeit, Zeitaufwand oder Umstände bei der Ausführung beziehen (§ 5 Abs. 2 GOZ)
* und sind im Einzelfall patientenbezogen zu prüfen.
*/
var GRUPPEN = [
	[/^(0080|0090|0100)$/, "Erschwerte Anästhesie durch anatomische Besonderheiten und entzündlich verändertes Gewebe; Nachinjektion und verlängerte Einwirkzeit erforderlich."],
	[/^0065$/, "Erhöhter Zeitaufwand bei der digitalen Abformung durch subgingival liegende Präparationsgrenzen, Blutungsneigung und mehrfache Teilscans."],
	[/^(2030|2040)$/, "Erschwerte Trockenlegung durch eingeschränkte Mundöffnung, starken Speichelfluss und subgingivale Defektränder."],
	[/^(2180|2190|2195|2197)$/, "Überdurchschnittlicher Zeitaufwand durch stark zerstörte Zahnhartsubstanz mit tief subgingivalen Defekträndern; aufwendige Trockenlegung und adhäsive Mehrschichttechnik, erschwerte Aufbereitung des Stiftbetts."],
	[/^(2200|2210|2220)$/, "Erschwerte Präparation durch tief subgingival reichende Defekt- und Füllungsränder; erhöhter Zeitaufwand für Blutstillung, Gingivaretraktion und Darstellung der Präparationsgrenze sowie für Anprobe und Okklusionseinstellung."],
	[/^(2260|2270|5120|5140|7080|7090)$/, "Erhöhter Zeitaufwand durch individuelle Gestaltung und mehrfache Anpassung des Provisoriums an Okklusion und Gingivaverlauf zur Ausformung des Weichgewebes."],
	[/^(2290|2300)$/, "Erhöhter Zeitaufwand durch fest zementierte bzw. tief verankerte Versorgung; besonders vorsichtiges Vorgehen zur Vermeidung einer Wurzelfraktur erforderlich."],
	[/^(2310|2320|5090|5100|5110)$/, "Erhöhter Aufwand für Reinigung, Anpassung und Kontrolle der Passung vor der Wiederbefestigung."],
	[/^(50[0-4]0)$/, "Erschwerte Präparation divergierender Pfeiler mit Herstellung einer gemeinsamen Einschubrichtung; erhöhter Zeitaufwand bei Abformung, Anprobe und Passungskontrolle mehrerer Pfeiler."],
	[/^(5050|5060|5070|5080|5150)$/, "Erhöhter Aufwand bei der Verbindung der Pfeiler: wiederholte Anprobe, Kontrolle von Einschubrichtung und Passung des Verbindungselements, Feinjustierung."],
	[/^(5170|5180|5190)$/, "Schwierige anatomische Verhältnisse (atrophierter Kiefer, ausgeprägte Muskel- und Bandansätze) mit mehrfacher funktioneller Randgestaltung."],
	[/^(52[0-3]0|5240|5250|5260|5270|5280|5290|5300|5310)$/, "Erhöhter Zeitaufwand durch ungünstige Kieferverhältnisse (Atrophie, Schlotterkamm, ungünstige Pfeilerverteilung) mit mehrfachen Anproben und Korrekturen zur Sicherung von Halt und Funktion."],
	[/^(80\d0)$/, "Erhöhter Zeitaufwand durch komplexe funktionelle Befunde mit wiederholter Registrierung und Kontrolle der Kieferrelation."],
	[/^9040$/, "Erschwerte Freilegung bei dicker, befestigter Mukosa; aufwendige Weichgewebsausformung um das Implantat."],
	[/^(9050|9060)$/, "Erhöhter Zeitaufwand durch mehrfachen Wechsel der Aufbauteile bei erschwerter Zugänglichkeit des Implantats; schonendes Vorgehen zum Schutz des periimplantären Gewebes."]
];
var ALLGEMEIN = "Überdurchschnittlicher Schwierigkeitsgrad und Zeitaufwand bei der Ausführung aufgrund der individuellen anatomischen und klinischen Verhältnisse.";
var standardBegruendung = (nr) => GRUPPEN.find(([re]) => re.test(nr.trim()))?.[1] ?? ALLGEMEIN;
//#endregion
//#region src/engine/zusatz.ts
var exoten = /* @__PURE__ */ JSON.parse("[{\"id\":\"krone\",\"titel\":\"Krone\",\"prioritaet\":10,\"situation\":\"krone-regel\",\"kuerzel\":[\"K\",\"KV\",\"KM\",\"KH\",\"KVH\",\"KMH\",\"KO\",\"KVO\",\"KMO\",\"PK\",\"PKV\",\"PKM\",\"VE\",\"VEK\",\"ZA\"],\"gruppen\":{\"praepariert\":[\"K\",\"KV\",\"KM\",\"KH\",\"KVH\",\"KMH\",\"KO\",\"KVO\",\"KMO\",\"PK\",\"PKV\",\"PKM\",\"VE\",\"VEK\",\"ZA\"],\"keramik\":[\"KM\",\"KMH\",\"KMO\",\"PKM\",\"VE\",\"VEK\"]},\"nicht\":[\"0040 nicht neben 0030: der schriftliche Plan ist schon berechnet\",\"8035 und 8065 gehören zur Brücke, zur Teleskopprothese und zu All-on, nicht zur einzelnen Krone\"],\"kurz\":\"Regler Krone: 2030, 0070, 0090, an Keramik 2197 und 2040, Funktionsanalyse 8000, 8010, 8020, oben 8050, 8080, 8090. Nicht 8035, nicht 8065, 0040 nicht neben 0030.\",\"text\":\"Schieberegler Zusatzleistungen für eine Krone, Teilkrone oder ein Veneer. Führend ist die speziellste Versorgung des Plans. Vorbereitende Nummern kommen aus jeder passenden Versorgung, jede Nummer nur einmal. Die Planung setzt die Krone selbst, GOZ 2210 oder 2220, das Provisorium 2270 und den Plan 0030. Der Regler setzt diese Grundnummern nicht noch einmal. Stufe 1: GOZ 2030 besondere Maßnahmen beim Präparieren, je Kieferhälfte oder Frontzahnbereich, nur am präparierten natürlichen Zahn. GOZ 0070 Vitalitätsprüfung, einmal je Sitzung. GOZ 0090 Infiltrationsanästhesie, je präpariertem Zahn. Stufe 2 nur an vollkeramischer Krone, Teilkrone oder Veneer: GOZ 2197 adhäsive Befestigung je Zahn und GOZ 2040 Kofferdam je Bereich. Nicht an einer metallischen Krone, nicht am Brückenglied, nicht an einer Teleskopprimärkrone. Stufe 3: GOZ 0065 setzt die Planung, sobald der Intraoralscan gewählt ist. Der Regler doppelt sie nicht und setzt sie nicht neben einen konventionellen Abdruck. Stufe 4 Funktionsdiagnostik: GOZ 8000 klinische Funktionsanalyse, GOZ 8010 ein Registrat, GOZ 8020 arbiträre Scharnierachse. Stufe 5 an der einzelnen Krone: GOZ 8050, 8080 und 8090. Nicht GOZ 8035 und nicht GOZ 8065. GOZ 0040 nicht neben 0030.\",\"stufen\":[{\"stufe\":1,\"nr\":\"2030\",\"je\":\"bereich\",\"an\":\"praepariert\",\"goz\":[\"2210\",\"2220\",\"5010\",\"5040\"],\"leer\":\"2030: keine zu präparierenden Zähne\",\"grund\":\"Besondere Maßnahmen beim Präparieren, je Kieferhälfte oder Frontzahnbereich\"},{\"stufe\":1,\"nr\":\"0070\",\"je\":\"sitzung\",\"an\":\"praepariert\",\"goz\":[\"2210\",\"2220\",\"5010\",\"5040\"],\"grund\":\"Vitalitätsprüfung vor der Präparation, je Sitzung\"},{\"stufe\":1,\"nr\":\"0090\",\"je\":\"zahn\",\"an\":\"praepariert\",\"goz\":[\"2210\",\"2220\",\"5010\",\"5040\"],\"grund\":\"Infiltrationsanästhesie, je Zahn\"},{\"stufe\":2,\"nr\":\"2197\",\"je\":\"zahn\",\"an\":\"keramik\",\"leer\":\"2197: keine vollkeramische Krone, Teilkrone oder kein Veneer\",\"grund\":\"Adhäsive Befestigung\"},{\"stufe\":2,\"nr\":\"2040\",\"je\":\"bereich\",\"an\":\"keramik\",\"grund\":\"Kofferdam zur adhäsiven Befestigung\"},{\"stufe\":4,\"nr\":\"8000\",\"je\":\"sitzung\",\"grund\":\"Klinische Funktionsanalyse zur Krone\"},{\"stufe\":4,\"nr\":\"8010\",\"je\":\"sitzung\",\"anzahl\":1,\"grund\":\"Registrieren der Zentrallage, ein Registrat\"},{\"stufe\":4,\"nr\":\"8020\",\"je\":\"sitzung\",\"grund\":\"Arbiträre Scharnierachse\"},{\"stufe\":5,\"nr\":\"8050\",\"je\":\"sitzung\",\"grund\":\"Halbindividueller Artikulator zur Krone\"},{\"stufe\":5,\"nr\":\"8080\",\"je\":\"sitzung\",\"grund\":\"Diagnostische Maßnahmen am Modell\"},{\"stufe\":5,\"nr\":\"8090\",\"je\":\"sitzung\",\"grund\":\"Diagnostischer Aufbau der Funktionsflächen\"}]},{\"id\":\"bruecke\",\"titel\":\"Brücke\",\"prioritaet\":30,\"situation\":\"bruecke\",\"kuerzel\":[\"B\",\"BV\",\"BM\",\"ABV\",\"ABM\",\"ZAB\",\"SB\",\"SBV\",\"SBM\",\"A\"],\"gruppen\":{\"praepariert\":[\"K\",\"KV\",\"KM\",\"KH\",\"KVH\",\"KMH\",\"KO\",\"KVO\",\"KMO\",\"PK\",\"PKV\",\"PKM\",\"ZA\",\"A\"],\"keramik\":[\"KM\",\"KMH\",\"KMO\",\"PKM\",\"SKM\",\"SKMO\"],\"implantat\":[\"SK\",\"SKV\",\"SKM\",\"SKO\",\"SKVO\",\"SKMO\",\"ZAS\"]},\"nicht\":[\"0040 nicht neben 0030: der schriftliche Plan ist schon berechnet\",\"8020 nicht neben 8035\",\"8050 nicht neben 8065\",\"2197 nicht am Brückenglied\"],\"kurz\":\"Regler Brücke: an den Ankern 2030, 0070, 0090, an Keramik 2197 und 2040. Funktionsanalyse Stufe 4 ist 8000, 8010, 8020. Stufe 5 ersetzt das durch 8035 und 8065, dazu 8080 und 8090. 8020 nicht neben 8035, 8050 nicht neben 8065.\",\"text\":\"Schieberegler Zusatzleistungen für eine Brücke, auch implantatgetragen, solange es nicht All-on-4 oder All-on-6 ist. Führend ist die speziellste Versorgung. Die Planung setzt das Brückenglied GOZ 5070 oder die Adhäsivbrücke 5150, das Provisorium 5140 und 5120 und den Plan 0030. Der Regler setzt diese Grundnummern nicht noch einmal. Stufe 1 an den natürlichen Ankerzähnen: GOZ 2030 je Kieferhälfte oder Frontzahnbereich, GOZ 0070 einmal je Sitzung, GOZ 0090 je Ankerzahn. Am Implantatanker GOZ 0090 zur Eingliederung, keine 2030, weil kein Zahn präpariert wird. Stufe 2 nur an der keramischen Ankerkrone, nicht am Brückenglied: GOZ 2197 und GOZ 2040. Stufe 3: GOZ 0065 bleibt bei der Planung des Scans und wird nicht gedoppelt. Stufe 4: GOZ 8000, GOZ 8010 ein Registrat, GOZ 8020. Stufe 5 elektronische Funktionsanalyse: GOZ 8035 statt 8020, GOZ 8065 statt 8050, dazu GOZ 8080 und GOZ 8090. 8020 nicht neben 8035. 8050 nicht neben 8065. GOZ 0040 nicht neben 0030.\",\"stufen\":[{\"stufe\":1,\"nr\":\"2030\",\"je\":\"bereich\",\"an\":\"praepariert\",\"goz\":[\"2210\",\"2220\",\"5010\",\"5040\"],\"leer\":\"2030: keine zu präparierenden Ankerzähne\",\"grund\":\"Besondere Maßnahmen beim Präparieren der Brückenanker\"},{\"stufe\":1,\"nr\":\"0070\",\"je\":\"sitzung\",\"an\":\"praepariert\",\"goz\":[\"2210\",\"2220\",\"5010\",\"5040\"],\"grund\":\"Vitalitätsprüfung der Anker, je Sitzung\"},{\"stufe\":1,\"nr\":\"0090\",\"je\":\"zahn\",\"an\":\"praepariert\",\"goz\":[\"2210\",\"2220\",\"5010\",\"5040\"],\"grund\":\"Infiltrationsanästhesie am Ankerzahn\"},{\"stufe\":1,\"nr\":\"0090\",\"je\":\"zahn\",\"an\":\"implantat\",\"grund\":\"Infiltrationsanästhesie zur Eingliederung der Implantatkrone\"},{\"stufe\":2,\"nr\":\"2197\",\"je\":\"zahn\",\"an\":\"keramik\",\"leer\":\"2197: kein keramischer Brückenanker\",\"grund\":\"Adhäsive Befestigung des Brückenankers\"},{\"stufe\":2,\"nr\":\"2040\",\"je\":\"bereich\",\"an\":\"keramik\",\"grund\":\"Kofferdam zur adhäsiven Befestigung\"},{\"stufe\":4,\"nr\":\"8000\",\"je\":\"sitzung\",\"grund\":\"Klinische Funktionsanalyse zur Brücke\"},{\"stufe\":4,\"nr\":\"8010\",\"je\":\"sitzung\",\"anzahl\":1,\"grund\":\"Registrieren der Zentrallage, ein Registrat\"},{\"stufe\":4,\"nr\":\"8020\",\"je\":\"sitzung\",\"bisStufe\":4,\"grund\":\"Arbiträre Scharnierachse\"},{\"stufe\":5,\"nr\":\"8035\",\"je\":\"sitzung\",\"grund\":\"Kinematische Scharnierachse, elektronische Aufzeichnung\"},{\"stufe\":5,\"nr\":\"8065\",\"je\":\"sitzung\",\"grund\":\"Elektronische Aufzeichnung der Unterkieferbewegungen\"},{\"stufe\":5,\"nr\":\"8080\",\"je\":\"sitzung\",\"grund\":\"Diagnostische Maßnahmen am Modell\"},{\"stufe\":5,\"nr\":\"8090\",\"je\":\"sitzung\",\"grund\":\"Diagnostischer Aufbau der Funktionsflächen\"}]},{\"id\":\"teleskopprothese\",\"titel\":\"Teleskopprothese\",\"prioritaet\":50,\"situation\":\"teleskop\",\"kuerzel\":[\"T\",\"TZ\",\"TZV\",\"TV\",\"TM\",\"T2\",\"T2V\",\"T2M\",\"ST\",\"STZ\",\"STZV\",\"STV\",\"STM\"],\"dazuKuerzel\":[\"E\",\"SE\",\"EO\",\"SEO\"],\"gruppen\":{\"teleskop\":[\"T\",\"TZ\",\"TZV\",\"TV\",\"TM\",\"ST\",\"STZ\",\"STZV\",\"STV\",\"STM\"]},\"nicht\":[\"0040 nicht neben 0030: der schriftliche Plan ist schon berechnet\",\"8020 nicht neben 8035\",\"8050 nicht neben 8065\",\"2197 nicht an der Teleskopprimärkrone\"],\"kurz\":\"Regler Teleskopprothese: 2030, 0070, 0090 an den Primärkronen, keine 2197. Funktionsanalyse 8000 und 8010 zweimal. Stufe 5: 8035 und 8065, dazu 8080, 8090 und 8100 je Zahnpaar. 8020 nicht neben 8035, 8050 nicht neben 8065.\",\"text\":\"Schieberegler Zusatzleistungen für eine Teleskopprothese oder Deckprothese auf Doppelkronen. Führend ist die speziellste Versorgung. Die Planung setzt die Primärkrone GOZ 5040 und die Prothese, GOZ 5210 mit 5170 oder bei Zahnlosigkeit 5220 oder 5230 mit 5180 oder 5190, und den Plan 0030. Der Regler setzt diese Grundnummern nicht noch einmal. Stufe 1 an der Primärkrone: GOZ 2030 je Bereich, GOZ 0070 einmal je Sitzung, GOZ 0090 je Primärkrone. Keine adhäsive Befestigung GOZ 2197 und kein Kofferdam GOZ 2040, die Primärkrone wird konventionell zementiert. Stufe 3: GOZ 0065 bleibt beim Scan in der Planung. Stufe 4: GOZ 8000 und GOZ 8010 zweimal, je Registrat, höchstens zweimal je Sitzung. Stufe 5 elektronische Funktionsanalyse: GOZ 8035 statt 8020, GOZ 8065 statt 8050, dazu GOZ 8080, GOZ 8090 und GOZ 8100 systematisches Einschleifen je Zahnpaar nach der Zahl der Teleskopkronen, höchstens acht. 8020 nicht neben 8035. 8050 nicht neben 8065. GOZ 0040 nicht neben 0030.\",\"stufen\":[{\"stufe\":1,\"nr\":\"2030\",\"je\":\"bereich\",\"an\":\"teleskop\",\"goz\":[\"5040\"],\"leer\":\"2030: keine Teleskopprimärkrone\",\"grund\":\"Besondere Maßnahmen beim Präparieren der Teleskopprimärkrone\"},{\"stufe\":1,\"nr\":\"0070\",\"je\":\"sitzung\",\"an\":\"teleskop\",\"goz\":[\"5040\"],\"grund\":\"Vitalitätsprüfung vor der Teleskoppräparation, je Sitzung\"},{\"stufe\":1,\"nr\":\"0090\",\"je\":\"zahn\",\"an\":\"teleskop\",\"goz\":[\"5040\"],\"grund\":\"Infiltrationsanästhesie an der Primärkrone\"},{\"stufe\":4,\"nr\":\"8000\",\"je\":\"sitzung\",\"grund\":\"Klinische Funktionsanalyse zur Teleskopprothese\"},{\"stufe\":4,\"nr\":\"8010\",\"je\":\"sitzung\",\"anzahl\":2,\"grund\":\"Registrieren der Zentrallage, zweites Registrat in derselben Sitzung\"},{\"stufe\":5,\"nr\":\"8035\",\"je\":\"sitzung\",\"grund\":\"Kinematische Scharnierachse, elektronische Aufzeichnung\"},{\"stufe\":5,\"nr\":\"8065\",\"je\":\"sitzung\",\"grund\":\"Elektronische Aufzeichnung der Unterkieferbewegungen\"},{\"stufe\":5,\"nr\":\"8080\",\"je\":\"sitzung\",\"grund\":\"Diagnostische Maßnahmen am Modell\"},{\"stufe\":5,\"nr\":\"8090\",\"je\":\"sitzung\",\"grund\":\"Diagnostischer Aufbau der Funktionsflächen\"},{\"stufe\":5,\"nr\":\"8100\",\"je\":\"paar\",\"an\":\"teleskop\",\"anzahlMax\":8,\"grund\":\"Systematisches Einschleifen, je Zahnpaar\"}]},{\"id\":\"teleskopkrone\",\"titel\":\"Teleskopkronen\",\"prioritaet\":45,\"situation\":\"teleskop\",\"kuerzel\":[\"T\",\"TZ\",\"TZV\",\"TV\",\"TM\",\"T2\",\"T2V\",\"T2M\",\"ST\",\"STZ\",\"STZV\",\"STV\",\"STM\"],\"gruppen\":{\"teleskop\":[\"T\",\"TZ\",\"TZV\",\"TV\",\"TM\",\"ST\",\"STZ\",\"STZV\",\"STV\",\"STM\"]},\"nicht\":[\"0040 nicht neben 0030: der schriftliche Plan ist schon berechnet\",\"8020 nicht neben 8035\",\"8050 nicht neben 8065\",\"2197 nicht an der Teleskopprimärkrone\"],\"kurz\":\"Regler Teleskopkronen ohne Prothese: gleiche Nummern wie die Teleskopprothese, 2030, 0070, 0090, 8000, 8010 zweimal, Stufe 5 mit 8035, 8065, 8080, 8090 und 8100. Keine 2197.\",\"text\":\"Schieberegler Zusatzleistungen für Teleskopkronen, wenn noch keine Prothese im Plan steht. Dieselbe Liste wie bei der Teleskopprothese. GOZ 5040 setzt die Planung. Stufe 1: GOZ 2030, 0070 und 0090 an der Primärkrone. Keine GOZ 2197. Stufe 4: GOZ 8000 und GOZ 8010 zweimal je Sitzung. Stufe 5: GOZ 8035, 8065, 8080, 8090 und 8100 je Zahnpaar. 8020 nicht neben 8035. 8050 nicht neben 8065. GOZ 0040 nicht neben 0030. Steht die Prothese dazu, führt die Teleskopprothese, nicht diese Zeile.\",\"stufen\":[{\"stufe\":1,\"nr\":\"2030\",\"je\":\"bereich\",\"an\":\"teleskop\",\"goz\":[\"5040\"],\"leer\":\"2030: keine Teleskopprimärkrone\",\"grund\":\"Besondere Maßnahmen beim Präparieren der Teleskopprimärkrone\"},{\"stufe\":1,\"nr\":\"0070\",\"je\":\"sitzung\",\"an\":\"teleskop\",\"goz\":[\"5040\"],\"grund\":\"Vitalitätsprüfung vor der Teleskoppräparation, je Sitzung\"},{\"stufe\":1,\"nr\":\"0090\",\"je\":\"zahn\",\"an\":\"teleskop\",\"goz\":[\"5040\"],\"grund\":\"Infiltrationsanästhesie an der Primärkrone\"},{\"stufe\":4,\"nr\":\"8000\",\"je\":\"sitzung\",\"grund\":\"Klinische Funktionsanalyse zu den Teleskopkronen\"},{\"stufe\":4,\"nr\":\"8010\",\"je\":\"sitzung\",\"anzahl\":2,\"grund\":\"Registrieren der Zentrallage, zweites Registrat in derselben Sitzung\"},{\"stufe\":5,\"nr\":\"8035\",\"je\":\"sitzung\",\"grund\":\"Kinematische Scharnierachse, elektronische Aufzeichnung\"},{\"stufe\":5,\"nr\":\"8065\",\"je\":\"sitzung\",\"grund\":\"Elektronische Aufzeichnung der Unterkieferbewegungen\"},{\"stufe\":5,\"nr\":\"8080\",\"je\":\"sitzung\",\"grund\":\"Diagnostische Maßnahmen am Modell\"},{\"stufe\":5,\"nr\":\"8090\",\"je\":\"sitzung\",\"grund\":\"Diagnostischer Aufbau der Funktionsflächen\"},{\"stufe\":5,\"nr\":\"8100\",\"je\":\"paar\",\"an\":\"teleskop\",\"anzahlMax\":8,\"grund\":\"Systematisches Einschleifen, je Zahnpaar\"}]},{\"id\":\"all-on-4\",\"titel\":\"All-on-4\",\"prioritaet\":60,\"situation\":\"allon\",\"kuerzel\":[\"SK\",\"SKV\",\"SKM\",\"SKO\",\"SKVO\",\"SKMO\",\"ZAS\"],\"dazuKuerzel\":[\"B\",\"BV\",\"BM\",\"SB\",\"SBV\",\"SBM\",\"ZAB\",\"E\",\"SE\",\"EO\",\"SEO\"],\"implantate\":{\"min\":4,\"max\":4},\"gruppen\":{\"implantat\":[\"SK\",\"SKV\",\"SKM\",\"SKO\",\"SKVO\",\"SKMO\",\"ZAS\"],\"keramik\":[\"SKM\",\"SKMO\"]},\"nicht\":[\"0040 nicht neben 0030: der schriftliche Plan ist schon berechnet\",\"8020 nicht neben 8035\",\"8050 nicht neben 8065\",\"9000 bis 9040 gehören in den Implantatplan, nicht in die Suprakonstruktion\",\"2030 nicht, es wird kein Zahn präpariert\"],\"kurz\":\"Regler All-on-4: 0090 je Implantat, an Keramik 2197 und 2040, keine 2030. Funktionsanalyse 8000 und 8010 zweimal. Stufe 5: 8035, 8065, 8080, 8090 und 8100 viermal. 8020 nicht neben 8035. Chirurgie 9000 nicht in diesem Plan.\",\"text\":\"Schieberegler Zusatzleistungen für All-on-4: genau vier implantatgetragene Kronen und eine Brücke oder Prothese. Führend vor der einzelnen Suprakonstruktion und vor der gewöhnlichen Brücke. Die Planung setzt GOZ 2200, als Anker GOZ 5000, das Glied GOZ 5070 und das Auswechseln der Aufbauten GOZ 9050. Der Regler setzt diese Grundnummern nicht noch einmal. Die Chirurgie GOZ 9000 bis 9040 gehört in den Implantatplan, nicht hier. Stufe 1: GOZ 0090 je Implantat zur Eingliederung. Keine GOZ 2030. Stufe 2 nur an der vollkeramischen Implantatkrone: GOZ 2197 und GOZ 2040. Stufe 3: GOZ 0065 bleibt beim Scan in der Planung. Stufe 4: GOZ 8000 und GOZ 8010 zweimal, höchstens zweimal je Sitzung. Stufe 5: GOZ 8035 statt 8020, GOZ 8065 statt 8050, dazu GOZ 8080, GOZ 8090 und GOZ 8100 je Zahnpaar, vier Paare. 8020 nicht neben 8035. 8050 nicht neben 8065. GOZ 0040 nicht neben 0030.\",\"stufen\":[{\"stufe\":1,\"nr\":\"0090\",\"je\":\"zahn\",\"an\":\"implantat\",\"grund\":\"Infiltrationsanästhesie zur Eingliederung, All-on-4\"},{\"stufe\":2,\"nr\":\"2197\",\"je\":\"zahn\",\"an\":\"keramik\",\"leer\":\"2197: keine vollkeramische Implantatkrone\",\"grund\":\"Adhäsive Befestigung der keramischen Implantatkrone\"},{\"stufe\":2,\"nr\":\"2040\",\"je\":\"bereich\",\"an\":\"keramik\",\"grund\":\"Kofferdam zur adhäsiven Befestigung\"},{\"stufe\":4,\"nr\":\"8000\",\"je\":\"sitzung\",\"grund\":\"Klinische Funktionsanalyse zu All-on-4\"},{\"stufe\":4,\"nr\":\"8010\",\"je\":\"sitzung\",\"anzahl\":2,\"grund\":\"Registrieren der Zentrallage, zweites Registrat in derselben Sitzung\"},{\"stufe\":5,\"nr\":\"8035\",\"je\":\"sitzung\",\"grund\":\"Kinematische Scharnierachse, elektronische Aufzeichnung\"},{\"stufe\":5,\"nr\":\"8065\",\"je\":\"sitzung\",\"grund\":\"Elektronische Aufzeichnung der Unterkieferbewegungen\"},{\"stufe\":5,\"nr\":\"8080\",\"je\":\"sitzung\",\"grund\":\"Diagnostische Maßnahmen am Modell\"},{\"stufe\":5,\"nr\":\"8090\",\"je\":\"sitzung\",\"grund\":\"Diagnostischer Aufbau der Funktionsflächen\"},{\"stufe\":5,\"nr\":\"8100\",\"je\":\"paar\",\"an\":\"implantat\",\"anzahlMax\":4,\"grund\":\"Systematisches Einschleifen, je Zahnpaar\"}]},{\"id\":\"all-on-6\",\"titel\":\"All-on-6\",\"prioritaet\":70,\"situation\":\"allon\",\"kuerzel\":[\"SK\",\"SKV\",\"SKM\",\"SKO\",\"SKVO\",\"SKMO\",\"ZAS\"],\"dazuKuerzel\":[\"B\",\"BV\",\"BM\",\"SB\",\"SBV\",\"SBM\",\"ZAB\",\"E\",\"SE\",\"EO\",\"SEO\"],\"implantate\":{\"min\":6,\"max\":6},\"gruppen\":{\"implantat\":[\"SK\",\"SKV\",\"SKM\",\"SKO\",\"SKVO\",\"SKMO\",\"ZAS\"],\"keramik\":[\"SKM\",\"SKMO\"]},\"nicht\":[\"0040 nicht neben 0030: der schriftliche Plan ist schon berechnet\",\"8020 nicht neben 8035\",\"8050 nicht neben 8065\",\"9000 bis 9040 gehören in den Implantatplan, nicht in die Suprakonstruktion\",\"2030 nicht, es wird kein Zahn präpariert\"],\"kurz\":\"Regler All-on-6: 0090 je Implantat, an Keramik 2197 und 2040, keine 2030. Funktionsanalyse 8000 und 8010 zweimal. Stufe 5: 8035, 8065, 8080, 8090 und 8100 sechsmal. 8020 nicht neben 8035. Chirurgie 9000 nicht in diesem Plan.\",\"text\":\"Schieberegler Zusatzleistungen für All-on-6: genau sechs implantatgetragene Kronen und eine Brücke oder Prothese. Führend vor All-on-4, vor der einzelnen Suprakonstruktion und vor der gewöhnlichen Brücke. Die Planung setzt GOZ 2200, als Anker GOZ 5000, das Glied GOZ 5070 und GOZ 9050. Der Regler setzt diese Grundnummern nicht noch einmal. Die Chirurgie GOZ 9000 bis 9040 gehört in den Implantatplan. Stufe 1: GOZ 0090 je Implantat. Keine GOZ 2030. Stufe 2 nur an der vollkeramischen Implantatkrone: GOZ 2197 und GOZ 2040. Stufe 3: GOZ 0065 bleibt beim Scan in der Planung. Stufe 4: GOZ 8000 und GOZ 8010 zweimal, höchstens zweimal je Sitzung. Stufe 5: GOZ 8035 statt 8020, GOZ 8065 statt 8050, dazu GOZ 8080, GOZ 8090 und GOZ 8100 je Zahnpaar, sechs Paare. 8020 nicht neben 8035. 8050 nicht neben 8065. GOZ 0040 nicht neben 0030.\",\"stufen\":[{\"stufe\":1,\"nr\":\"0090\",\"je\":\"zahn\",\"an\":\"implantat\",\"grund\":\"Infiltrationsanästhesie zur Eingliederung, All-on-6\"},{\"stufe\":2,\"nr\":\"2197\",\"je\":\"zahn\",\"an\":\"keramik\",\"leer\":\"2197: keine vollkeramische Implantatkrone\",\"grund\":\"Adhäsive Befestigung der keramischen Implantatkrone\"},{\"stufe\":2,\"nr\":\"2040\",\"je\":\"bereich\",\"an\":\"keramik\",\"grund\":\"Kofferdam zur adhäsiven Befestigung\"},{\"stufe\":4,\"nr\":\"8000\",\"je\":\"sitzung\",\"grund\":\"Klinische Funktionsanalyse zu All-on-6\"},{\"stufe\":4,\"nr\":\"8010\",\"je\":\"sitzung\",\"anzahl\":2,\"grund\":\"Registrieren der Zentrallage, zweites Registrat in derselben Sitzung\"},{\"stufe\":5,\"nr\":\"8035\",\"je\":\"sitzung\",\"grund\":\"Kinematische Scharnierachse, elektronische Aufzeichnung\"},{\"stufe\":5,\"nr\":\"8065\",\"je\":\"sitzung\",\"grund\":\"Elektronische Aufzeichnung der Unterkieferbewegungen\"},{\"stufe\":5,\"nr\":\"8080\",\"je\":\"sitzung\",\"grund\":\"Diagnostische Maßnahmen am Modell\"},{\"stufe\":5,\"nr\":\"8090\",\"je\":\"sitzung\",\"grund\":\"Diagnostischer Aufbau der Funktionsflächen\"},{\"stufe\":5,\"nr\":\"8100\",\"je\":\"paar\",\"an\":\"implantat\",\"anzahlMax\":6,\"grund\":\"Systematisches Einschleifen, je Zahnpaar\"}]},{\"id\":\"suprakonstruktion\",\"titel\":\"Suprakonstruktion\",\"prioritaet\":20,\"situation\":\"implantat-krone\",\"kuerzel\":[\"SK\",\"SKV\",\"SKM\",\"SKO\",\"SKVO\",\"SKMO\",\"ZAS\",\"SO\"],\"gruppen\":{\"implantat\":[\"SK\",\"SKV\",\"SKM\",\"SKO\",\"SKVO\",\"SKMO\",\"ZAS\",\"SO\"],\"keramik\":[\"SKM\",\"SKMO\"]},\"nicht\":[\"0040 nicht neben 0030: der schriftliche Plan ist schon berechnet\",\"9000 bis 9040 gehören in den Implantatplan, nicht in die Suprakonstruktion\",\"8035 und 8065 erst bei Brücke, Teleskopprothese, All-on-4 oder All-on-6\"],\"kurz\":\"Regler Suprakonstruktion: 0090 je Implantat, an Keramik 2197 und 2040, keine 2030. Funktionsanalyse 8000, 8010, 8020, oben 8050, 8080, 8090. All-on-4 und All-on-6 führen, sobald es genau vier oder sechs Implantate mit Brücke oder Prothese sind.\",\"text\":\"Schieberegler Zusatzleistungen für eine Suprakonstruktion, die einzelne Implantatkrone oder wenige Implantatkronen, nicht All-on-4 und nicht All-on-6. Die Planung setzt GOZ 2200 oder als Anker GOZ 5000 und das Auswechseln GOZ 9050. Der Regler setzt diese Grundnummern nicht noch einmal. Die Chirurgie GOZ 9000 bis 9040 gehört in den Implantatplan. Stufe 1: GOZ 0090 je Implantat zur Eingliederung. Keine GOZ 2030. Stufe 2 nur an der vollkeramischen Implantatkrone: GOZ 2197 und GOZ 2040. Stufe 3: GOZ 0065 bleibt beim Scan in der Planung. Stufe 4: GOZ 8000, GOZ 8010 ein Registrat, GOZ 8020. Stufe 5: GOZ 8050, 8080 und 8090. Die elektronische Analyse GOZ 8035 und 8065 übernimmt die Brücke, die Teleskopprothese oder All-on, sobald diese Versorgung führt. GOZ 0040 nicht neben 0030.\",\"stufen\":[{\"stufe\":1,\"nr\":\"0090\",\"je\":\"zahn\",\"an\":\"implantat\",\"grund\":\"Infiltrationsanästhesie zur Eingliederung der Suprakonstruktion\"},{\"stufe\":2,\"nr\":\"2197\",\"je\":\"zahn\",\"an\":\"keramik\",\"leer\":\"2197: keine vollkeramische Implantatkrone\",\"grund\":\"Adhäsive Befestigung der keramischen Implantatkrone\"},{\"stufe\":2,\"nr\":\"2040\",\"je\":\"bereich\",\"an\":\"keramik\",\"grund\":\"Kofferdam zur adhäsiven Befestigung\"},{\"stufe\":4,\"nr\":\"8000\",\"je\":\"sitzung\",\"grund\":\"Klinische Funktionsanalyse zur Suprakonstruktion\"},{\"stufe\":4,\"nr\":\"8010\",\"je\":\"sitzung\",\"anzahl\":1,\"grund\":\"Registrieren der Zentrallage, ein Registrat\"},{\"stufe\":4,\"nr\":\"8020\",\"je\":\"sitzung\",\"grund\":\"Arbiträre Scharnierachse\"},{\"stufe\":5,\"nr\":\"8050\",\"je\":\"sitzung\",\"grund\":\"Halbindividueller Artikulator zur Suprakonstruktion\"},{\"stufe\":5,\"nr\":\"8080\",\"je\":\"sitzung\",\"grund\":\"Diagnostische Maßnahmen am Modell\"},{\"stufe\":5,\"nr\":\"8090\",\"je\":\"sitzung\",\"grund\":\"Diagnostischer Aufbau der Funktionsflächen\"}]}]");
/**
* Regler wie im HKP: zusätzliche GOZ-Leistungen und Qualitätsstufen im Labor.
* Jede Stufe nimmt nur Leistungen auf, für die die Planung eine Grundlage enthält.
*/
var GOZ_STUFEN = [
	{
		titel: "keine",
		leistungen: ""
	},
	{
		titel: "Präparation",
		leistungen: "2030, 0070, 0090 aus der Wissensbasis, je nach Krone, Brücke, Teleskop oder Suprakonstruktion"
	},
	{
		titel: "Adhäsiv",
		leistungen: "2197 und 2040 nur an Keramik, nicht am Teleskop und nicht am Brückenglied"
	},
	{
		titel: "Scan",
		leistungen: "0065 bleibt in der Planung und wird nicht gedoppelt"
	},
	{
		titel: "Funktionsdiagnostik",
		leistungen: "8000, 8010, 8020. Teleskop und All-on: 8010 zweimal, ohne 8020"
	},
	{
		titel: "elektronisch",
		leistungen: "Brücke, Teleskop, All-on-4 und All-on-6: 8035 und 8065. Krone und einzelne Suprakonstruktion: 8050, 8080, 8090"
	}
];
var LABOR_STUFEN = [
	{
		titel: "Standard",
		text: "Laborleistungen wie geplant"
	},
	{
		titel: "Ästhetik",
		text: "+ individuelle Charakterisierung je Keramikeinheit, Farbbestimmung im Labor"
	},
	{
		titel: "Funktion",
		text: "+ Wax-up je Einheit, individueller Artikulator, Frontzahnführungsteller"
	},
	{
		titel: "Premium",
		text: "+ Wurzelpontic je Keramik-Brückenglied, Stumpfvorbereitung unter dem Mikroskop"
	}
];
GOZ_STUFEN.length - 1;
LABOR_STUFEN.length - 1;
var zusatzSchluessel = (p) => `${p.ebene}|${p.nr}|${p.zahn}`;
/** Kieferhälfte bzw. Frontzahnbereich im Sinne der GOZ (13–23 und 33–43 = Frontzahnbereich) */
function bereich(zahn) {
	if (Number(zahn[1]) <= 3) return zahn[0] === "1" || zahn[0] === "2" ? "OK-Front" : "UK-Front";
	return {
		"1": "OK rechts",
		"2": "OK links",
		"3": "UK links",
		"4": "UK rechts"
	}[zahn[0]] ?? zahn[0];
}
var BEREICH_ZAEHNE = {
	"OK rechts": "18-14",
	"OK-Front": "13-23",
	"OK links": "24-28",
	"UK links": "34-38",
	"UK-Front": "33-43",
	"UK rechts": "44-48"
};
var KERAMIK = /* @__PURE__ */ new Set([
	"2281",
	"2612",
	"2351",
	"2534",
	"2653",
	"2251",
	"2252"
]);
var EINHEIT = /^(2101|2104|2121|2126|2155|2281|2351|2361|2534|2653|2663|3001|2251|2252)$/;
function zusatzleistungen({ zaehne, abformung, basis, gozStufe, laborStufe, aus }) {
	const positionen = [];
	const nichtAngesetzt = [];
	const vorhanden = new Set(basis.map(zusatzSchluessel));
	const abgewaehlt = new Set(aus);
	const neu = (ebene, nr, zahn, grund, anzahl = 1) => {
		const p = {
			id: `zusatz:${ebene}:${nr}:${zahn}`,
			ebene,
			nr,
			zahn,
			anzahl,
			auto: true,
			zusatz: ebene === "GOZ" ? "goz" : "labor",
			grund
		};
		const k = zusatzSchluessel(p);
		if (!vorhanden.has(k) && !abgewaehlt.has(k)) {
			positionen.push(p);
			vorhanden.add(k);
		}
	};
	const TP = (z) => (zaehne[z]?.TP ?? "").trim().toUpperCase();
	const anZahn = (z) => basis.filter((p) => p.zahn === z);
	const bereicheVon = (liste) => [...new Set(liste.map(bereich))];
	const einzelzaehne = [...new Set(basis.map((p) => p.zahn).filter((z) => /^[1-4][1-8]$/.test(z)))];
	const geplante = Object.keys(zaehne).filter((z) => /^[1-4][1-8]$/.test(z) && TP(z) && TP(z) !== ")(");
	const treffer = exoten.filter((e) => {
		const eigene = geplante.filter((z) => e.kuerzel.includes(TP(z)));
		if (!eigene.length) return false;
		if (e.implantate && (eigene.length < e.implantate.min || eigene.length > e.implantate.max)) return false;
		if (e.dazuKuerzel?.length && !e.dazuKuerzel.some((k) => geplante.some((z) => TP(z) === k))) return false;
		return true;
	}).sort((a, b) => b.prioritaet - a.prioritaet);
	const fuehrung = treffer[0];
	if (gozStufe > 0 && !fuehrung) nichtAngesetzt.push("Regler: keine Krone, Brücke, Teleskopprothese, All-on oder Suprakonstruktion im Plan");
	if (fuehrung) nichtAngesetzt.push(`Regler folgt der Wissensbasis: ${fuehrung.titel}`);
	const gruppe = (e, name, goz) => {
		const liste = name && e.gruppen[name] || [];
		return einzelzaehne.filter((z) => liste.includes(TP(z)) && (!goz?.length || anZahn(z).some((p) => p.ebene === "GOZ" && goz.includes(p.nr))));
	};
	for (const e of treffer) for (const zeile of e.stufen) {
		if (zeile.stufe >= 4 && e !== fuehrung) continue;
		if (gozStufe < zeile.stufe || zeile.bisStufe && gozStufe > zeile.bisStufe) continue;
		if (!zeile.nr) continue;
		const zahnListe = zeile.an ? gruppe(e, zeile.an, zeile.goz) : [];
		if (zeile.je === "sitzung" || !zeile.an) {
			if (zeile.an && !zahnListe.length) {
				if (zeile.leer) nichtAngesetzt.push(zeile.leer);
				continue;
			}
			neu("GOZ", zeile.nr, "", zeile.grund, zeile.anzahl ?? 1);
			continue;
		}
		if (!zahnListe.length) {
			if (zeile.leer) nichtAngesetzt.push(zeile.leer);
			continue;
		}
		if (zeile.je === "zahn") for (const z of zahnListe) neu("GOZ", zeile.nr, z, `${zeile.grund} ${TP(z)}`);
		else if (zeile.je === "bereich") for (const b of bereicheVon(zahnListe)) neu("GOZ", zeile.nr, BEREICH_ZAEHNE[b], `${zeile.grund} (${b})`);
		else if (zeile.je === "paar") neu("GOZ", zeile.nr, "", zeile.grund, Math.min(zeile.anzahlMax ?? 8, zahnListe.length));
	}
	if (gozStufe >= 4 && fuehrung) for (const n of fuehrung.nicht) nichtAngesetzt.push(n);
	if (gozStufe >= 3) {
		if (!abformung) nichtAngesetzt.push("0065: Abformung noch nicht gewählt");
		else if (abformung === "abdruck") nichtAngesetzt.push("0065: konventioneller Abdruck gewählt");
		else if (basis.some((p) => p.nr === "0065")) nichtAngesetzt.push("0065: digitale Abformung ist bereits enthalten (Intraoralscan)");
	}
	const einheiten = einzelzaehne.filter((z) => anZahn(z).some((p) => p.ebene === "BEB" && EINHEIT.test(p.nr)));
	const keramik = einzelzaehne.filter((z) => anZahn(z).some((p) => p.ebene === "BEB" && KERAMIK.has(p.nr)));
	if (laborStufe >= 1) {
		if (!keramik.length) nichtAngesetzt.push("BEB 2951: keine Keramikeinheiten");
		for (const z of keramik) neu("BEB", "2951", z, `Individuelle Charakterisierung der Keramik ${TP(z)}`);
		if (einheiten.length && !basis.some((p) => p.nr === "0723" && p.ebene === "BEB")) neu("BEB", "0723", "", "Zahnfarbenbestimmung im Labor");
	}
	if (laborStufe >= 2) {
		for (const z of einheiten) neu("BEB", "0833", z, `Wax-up/Mock-up ${TP(z)}`);
		if (einheiten.length) neu("BEB", "0405", "", "Modellmontage im individuellen Artikulator");
		if (einheiten.some(istFrontzahn)) neu("BEB", "0522", "", "Individueller Frontzahnführungsteller");
	}
	if (laborStufe >= 3) {
		const glieder = keramik.filter((z) => /^S?BM$/.test(TP(z)));
		for (const z of glieder) neu("BEB", "2678", z, "Wurzelpontic aus Keramik");
		for (const z of einheiten.filter((x) => !/^S/.test(TP(x)) && !/^(S?B|AB)/.test(TP(x)))) neu("BEB", "0217", z, "Stumpf unter Mikroskop vorbereiten");
	}
	if (laborStufe > 0 && !einheiten.length) nichtAngesetzt.push("Laborstufe: keine festsitzenden Laborarbeiten geplant");
	return {
		positionen,
		nichtAngesetzt
	};
}
//#endregion
//#region src/engine/eigenlabor.ts
var bebNorm = (s) => s.trim().padStart(4, "0");
/**
* Dieselbe Leistung unter mehreren BEB-Nummern: die Planung setzt eine davon (Keramikkrone 2281,
* Keramik-Brückenglied 2351), Praxis- und Laborlisten führen oft die andere.
*/
var GLEICHWERTIG = [[
	"2281",
	"2251",
	"2252"
], [
	"2351",
	"2352",
	"2361"
]];
/**
* Praxisposition zu einer Nummer. Von Hand gewählt: die Position mit genau dieser Nummer. Von der Planung
* gesetzt: die dem Leistungsschritt zugeordnete Position (Variante des Ablaufs zuerst); Positionen ohne
* Zuordnung wie bisher über gleiche Nummer bzw. „statt BEB-Nr.“.
*/
function eigenFinden(katalog, nr, k = {}) {
	if (!katalog?.length || !nr.trim()) return void 0;
	const t = nr.trim();
	const ziel = /^\d{1,4}$/.test(t) ? bebNorm(t) : t;
	const gleicheNr = katalog.find((e) => e.nr.trim() === t);
	if (!k.auto && gleicheNr) return gleicheNr;
	const ablauf = k.ablauf === "scan" ? "scan" : "abdruck";
	const gruppe = GLEICHWERTIG.find((g) => g.includes(ziel)) ?? [ziel];
	const fuerNorm = (e) => e.fuer && /^\d{1,4}$/.test(e.fuer) ? bebNorm(e.fuer) : e.fuer ?? "";
	const zugeordnet = katalog.filter((e) => e.fuer && gruppe.includes(fuerNorm(e)) && (!e.wenn || e.wenn === ablauf));
	const rang = (e) => (fuerNorm(e) === ziel ? 0 : 4) + (e.wenn ? 0 : 2) + (e.nr.trim() === t ? 0 : 1);
	if (zugeordnet.length) return zugeordnet.reduce((a, b) => rang(b) < rang(a) ? b : a);
	const ohneZuordnung = (e) => e.fuer === void 0;
	if (gleicheNr && ohneZuordnung(gleicheNr)) return gleicheNr;
	return /^\d{1,4}$/.test(t) ? katalog.find((e) => ohneZuordnung(e) && e.ersetzt && bebNorm(e.ersetzt) === ziel) : void 0;
}
//#endregion
//#region src/engine/beb-standard.ts
var r = (nr, text, preis) => ({
	nr,
	text,
	preis,
	richtpreis: true
});
/**
* Positionen, die jede BEB-Liste jedes Mandanten enthält. Fehlt eine Nummer, wird sie mit Richtpreis
* (netto) ergänzt; vorhandene Nummern behalten Text und Preis der Liste.
*/
var BEB_STANDARD = [
	r("0007", "Oralscan aufbereiten", 14),
	r("0009", "Scan Spezialmodell, Kunststoff gedruckt je Kiefer", 23),
	r("0013", "Präp freilegen Oralscan", 6.5),
	r("0017", "Stumpf Digitaldruck", 9.5),
	r("0032", "Sintern", 12),
	r("0710", "Eiltermin Zuschlag", 1),
	r("0723", "Zahnfarbenbestimmung I", 30),
	r("0724", "Zahnfarbenbestimmung II", 45),
	r("0901", "CAD: Anlage Auftragsdaten", 9.5),
	r("0902", "CAD: optisch digitale Registrierung", 14.5),
	r("0903", "CAD: Modellsegmentierung", 9.5),
	r("0904", "CAD: Segment / Biss digitalisieren, je Segment/Biss", 6.5),
	r("0905", "CAD: Bearbeitung Präpgrenze entsprechend dem Scan", 6.5),
	r("0906", "CAD: Glanz- und Kristallisationsbrand", 14),
	r("0907", "CAD: Einzelkrone konstruieren", 28),
	r("0908", "CAD: Brückenglied konstruieren", 24),
	r("0909", "CAD: Kaufläche konstruieren", 18),
	r("0910", "CAD: Verbundkonstruktion / Verbinder", 9.5),
	r("0911", "CAD: CAM Element nacharbeiten", 12),
	r("1401", "Provisorische Krone, Brückenglied, PMMA", 35),
	r("2281", "Krone aus Keramik gefräst (Anatomisch Vollzirkon)", 110),
	r("2361", "Brückenglied aus Keramik (Anatomisches Vollzirkon)", 110),
	r("2362", "Brückenglied gegossen/gefräst Metall", 98),
	r("2556", "Pro-Inlay, einflächig", 85),
	r("2557", "Pro-Inlay, zweiflächig", 95),
	r("2558", "Pro-Inlay, dreiflächig", 108),
	r("2559", "Pro-Inlay, mehrflächig; Onlay", 125),
	r("3303", "Sekundär Teleskop in Metallbasis einarbeiten", 45),
	r("3541", "Konfektionsriegel primär", 60),
	r("3641", "Konfektionsriegel sekundär", 60)
];
/** Nummern, die in älteren Listen eine andere Leistung tragen: die alte Leistung zieht auf `neu` um */
var UMZUG = [{
	nr: "0007",
	alt: /kontrollmodell/i,
	neu: "0008"
}, {
	nr: "2361",
	alt: /metall/i,
	neu: "2362"
}];
var norm = (nr) => nr.trim().padStart(4, "0");
/** Ergänzt eine BEB-Liste um die fehlenden Standardpositionen; ohne Änderung kommt dieselbe Liste zurück. */
function bebErgaenzen(liste) {
	const eintraege = [...liste.eintraege];
	let geaendert = false;
	for (const u of UMZUG) {
		const i = eintraege.findIndex((e) => norm(e.nr) === u.nr);
		if (i < 0 || !u.alt.test(eintraege[i].text)) continue;
		const [alt] = eintraege.splice(i, 1);
		if (!eintraege.some((e) => norm(e.nr) === u.neu)) eintraege.push({
			...alt,
			nr: u.neu
		});
		geaendert = true;
	}
	const fehlend = BEB_STANDARD.filter((s) => !eintraege.some((e) => norm(e.nr) === s.nr));
	if (!fehlend.length && !geaendert) return liste;
	return {
		...liste,
		eintraege: [...eintraege, ...fehlend].sort((a, b) => norm(a.nr).localeCompare(norm(b.nr)))
	};
}
//#endregion
//#region src/engine/zuordnung.ts
/**
* Zuordnung der Praxis- bzw. Fremdlabor-Positionen zu den Leistungsschritten, die PlanR plant.
* PlanR plant mit den Nummern der BEB-Standardliste (BEB-ITZ 2024 + Standardpositionen + digitale Schritte).
* Praxislisten stammen aus anderen BEB-Ausgaben (BEB 97, BEB Zahntechnik, VDZI) oder haben eigene Nummern –
* gleiche Nummer heißt dort nicht gleiche Leistung (z. B. BEB 97 2955 „Glasieren“, BEB-ITZ 2955 „Fräsen je Glied“).
* Deshalb wird jede Position über ihren Text einem Schritt zugeordnet; Varianten (gegossen/gefräst) gelten nur
* für den passenden Ablauf (Abdruck/Intraoralscan). Material ohne BEB-Nummer bekommt eine Rolle (Prothesenzahn,
* Abformmaterial …), mit der die Planung es dort ansetzt, wo es anfällt. Von Hand festgelegte Zuordnungen bleiben.
*/
var rolleZiel = (r) => `MAT:${r}`;
var STOPP = /* @__PURE__ */ new Set([
	"aus",
	"auf",
	"fur",
	"fuer",
	"der",
	"die",
	"das",
	"des",
	"dem",
	"den",
	"und",
	"oder",
	"mit",
	"ohne",
	"von",
	"vom",
	"zum",
	"zur",
	"bei",
	"nach",
	"pro",
	"eines",
	"einer",
	"einem",
	"einen",
	"eine",
	"ein",
	"inkl",
	"incl",
	"zzgl",
	"als",
	"nur",
	"auch",
	"in",
	"an",
	"je",
	"voll"
]);
/** Begriffe, die auch in zusammengesetzten oder abgekürzten Wörtern stecken („Kompositverblendung“, „teilverbl.“) */
var BEGRIFFE = [
	[/verblendschalen?|veneers?/, "veneer"],
	[/verblend(ungen|ung|eten|ete|et)?|verbl$/, "verblendung"],
	[/keramik(en)?/, "keramik"],
	[/komposit(en|e)?|polymer(en|e)?|polyme$/, "komposit"],
	[/kunststoff(en|e)?/, "kunststoff"],
	[/zirkon(dioxid|oxid)?|lithiumdisilikat/, "keramik"],
	[/monolithisch(en|er|es|e)?|(voll)?anatomisch(en|er|es|e)?/, "vollanatomisch"],
	[/gefrae?s+t(en|er|es|e)?/, "gefraest"],
	[/^g?egossen(en|er|es|e)?|^gossen(en|er|es|e)?|^guss(?!s)/, "gegossen"]
];
/** Metall ist in der BEB der Normalfall; nennt der Schritt keinen Werkstoff, zählt die Legierung der Praxis nicht */
var METALL = /^(nem|edelmetall|hochgold|gold|titan|cocr|cocrmo|palladium|metall|legierung)$/;
var WERKSTOFF = /^(nem|edelmetall|hochgold|gold|titan|metall\w*|legierung|keramik|komposit|kunststoff|pmma|wachs)$/;
var NICHT_METALL = /* @__PURE__ */ new Set([
	"keramik",
	"komposit",
	"kunststoff"
]);
var RESTAURATION = /(krone|inlay|onlay|glied)$/;
var VERFAHREN = /* @__PURE__ */ new Set([
	"gegossen",
	"gefraest",
	"gebogen",
	"gepresst"
]);
/** Alternativen im Text des Schritts („gegossen/gefräst“, „Keramik/Kompositverblendung“) */
var ALTERNATIVEN = [["gegossen", "gefraest"], ["keramik", "komposit"]];
var klein = (s) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
/** Kleinbuchstaben ohne Umlaute, Wörter ohne Füllwörter; Komposita mit einem Begriff werden zerlegt */
function woerter(s) {
	const roh = klein(s).split(/[^a-z0-9]+/).filter((w) => (w.length >= 3 || w === "nem") && !STOPP.has(w) && !/^\d+$/.test(w));
	const aus = [];
	for (const w of roh) {
		let teile = [w];
		for (const [re, begriff] of BEGRIFFE) teile = teile.flatMap((t) => {
			const m = re.exec(t);
			if (!m) return [t];
			aus.push(begriff);
			return [t.slice(0, m.index), t.slice(m.index + m[0].length)];
		});
		if (teile.length === 1 && teile[0] === w) aus.push(w);
		else aus.push(...teile.filter((t) => t.length >= 4 && !STOPP.has(t)));
	}
	return [...new Set(aus)];
}
/**
* Gleiches Wort: Beugung oder abgeschnittenes Wort („individuellen/-er“, „Artikulat.“) und das Grundwort eines
* Kompositums („Spezialmodell“ – „Modell“). Locker (bei gleicher Nummer) zählt auch ein gemeinsamer Wortanfang.
*/
function wortTreffer(a, b, locker) {
	if (a === b) return "gleich";
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	const kurz = Math.min(a.length, b.length);
	const lang = Math.max(a.length, b.length);
	if (i >= 5 && kurz - i <= 2 && lang - i <= 4) return "gleich";
	if (locker && (i >= 5 ? kurz - i <= 2 : i >= 4 && i === kurz)) return "teil";
	const [k, l] = a.length <= b.length ? [a, b] : [b, a];
	return k.length >= 5 && l.endsWith(k) ? "teil" : void 0;
}
var VOKABULAR = (() => {
	const basis = bebErgaenzen({ eintraege: beb_itz_2024_default.eintraege }).eintraege;
	const alle = /* @__PURE__ */ new Map();
	const dazu = (nr, text) => {
		const t = alle.get(nr) ?? [];
		if (!t.includes(text)) t.push(text);
		alle.set(nr, t);
	};
	for (const e of basis) dazu(bebNorm(e.nr), e.text);
	for (const e of BEB_STANDARD) dazu(bebNorm(e.nr), e.text);
	for (const d of DIGITAL_KATALOG) dazu(d.nr, d.text);
	return [...alle].map(([nr, t]) => ({
		nr,
		text: t[0],
		texte: t.map(woerter)
	}));
})();
var NACH_NR = new Map(VOKABULAR.map((e) => [e.nr, e]));
var DF = (() => {
	const df = /* @__PURE__ */ new Map();
	for (const e of VOKABULAR) for (const w of new Set(e.texte.flat())) df.set(w, (df.get(w) ?? 0) + 1);
	return df;
})();
var gewicht = (w) => 1 + Math.log((VOKABULAR.length + 1) / ((DF.get(w) ?? 0) + 1));
/** Bauteile, deren Arten eigene Leistungen sind (Dreiviertel-, Teil-, Teleskop-, Doppelkrone) */
var KOPF = /* @__PURE__ */ new Set([
	"krone",
	"glied",
	"brueckenglied",
	"inlay"
]);
/**
* Anteil eines Worts, der in der anderen Wortliste wiederkommt. Teiltreffer zählen mit dem kleineren Gewicht,
* über Nummern hinweg nur zu einem Viertel („Doppelkrone“ ist keine „Krone“); bei gleicher Nummer voll, außer
* das Bauteil der Praxis ist allgemeiner als das des Schritts („Krone“ bestätigt nicht „Dreiviertelkrone“).
*/
function anteil(x, andere, locker, xVonPraxis) {
	let best = 0;
	for (const y of andere) {
		const t = wortTreffer(x, y, locker);
		if (t === "gleich") return gewicht(x);
		if (t !== "teil") continue;
		const [praxisWort, schrittWort] = xVonPraxis ? [x, y] : [y, x];
		const schrittSpezieller = schrittWort.length > praxisWort.length && KOPF.has(praxisWort);
		best = Math.max(best, Math.min(gewicht(x), gewicht(y)) * (!locker ? .25 : schrittSpezieller ? .5 : 1));
	}
	return best;
}
function aehnlichWorte(p, standard, locker) {
	let a = p.w;
	let b = standard;
	if (!a.length || !b.length) return 0;
	const letztes = a[a.length - 1];
	if (p.gekuerzt && !b.some((x) => wortTreffer(letztes, x, true))) a = a.slice(0, -1);
	for (const [x, y] of ALTERNATIVEN) {
		if (!b.includes(x) || !b.includes(y)) continue;
		if (a.includes(x) !== a.includes(y)) b = b.filter((w) => w !== (a.includes(x) ? y : x));
		else if (!a.includes(x)) b = b.filter((w) => w !== x && w !== y);
	}
	const neutral = /* @__PURE__ */ new Set();
	if (!b.some((w) => WERKSTOFF.test(w))) {
		for (const w of a) if (METALL.test(w)) neutral.add(w);
	}
	if (!b.some((w) => VERFAHREN.has(w) || NICHT_METALL.has(w))) neutral.add("gegossen");
	if (a.every((w) => neutral.has(w))) return 0;
	let treffer = 0;
	let summe = 0;
	for (const x of a) {
		summe += gewicht(x) * (neutral.has(x) ? .3 : 1);
		treffer += anteil(x, b, locker, true);
	}
	for (const y of b) {
		summe += gewicht(y);
		treffer += anteil(y, a, locker, false);
	}
	return summe ? treffer / summe : 0;
}
var aehnlichsterText = (p, e, locker = false) => Math.max(...e.texte.map((t) => aehnlichWorte(p, t, locker)));
/** Variante nur für einen Ablauf: der Schritt nennt beide Fertigungsarten („gegossen/gefräst“), die Praxisposition eine */
function ablaufVon(praxis, e) {
	if (!e.texte.some((t) => t.includes("gegossen") && t.includes("gefraest"))) return void 0;
	const p = woerter(praxis);
	if (p.includes("gegossen") === p.includes("gefraest")) return void 0;
	return p.includes("gefraest") ? "scan" : "abdruck";
}
var OHNE_ZAHN = /krone|bruecke|provisor|verblend|stift|charakteris|reparatur|instandsetz|erweiter|gnatholog|aufstell|modell|wachs/;
/** Material und Teile ohne BEB-Nummer: Rolle aus dem Text */
var ROLLEN_REGELN = [
	[
		"zahn-front",
		/\bfront ?z(ae|a)hne?\b/,
		OHNE_ZAHN
	],
	[
		"zahn-seite",
		/\bseiten ?z(ae|a)hne?\b/,
		OHNE_ZAHN
	],
	["abform-alginat", /alginat.*(kiefer|abdruck|abformung)|(kiefer|abdruck|abformung).*alginat/],
	["abform-praezision", /doppelmisch|korrekturabform|praezisionsabform|praezisionsabdruck/],
	["abform-funktion", /funktionsabform|funktionsabdruck/],
	["registrat", /registrier\w*material|registratmaterial|bissregistrat\b|\bfutar\b|occlufast|regisil|blu ?mousse/],
	["rohling-zirkon", /zirkon\w*.*(rohling|ronde|multilayer|block|disc)|(rohling|ronde|multilayer|block|disc).*zirkon/],
	["rohling-lithiumdisilikat", /(lithium|e ?max).*(rohling|block|cad)/],
	["rohling-presskeramik", /press ?keramik.*rohling|e ?max press/],
	["legierung-nem", /\b(nem|cocr|kobalt ?chrom)\b.*legierung|legierung.*\b(nem|cocr)\b|wirobond|remanium/],
	["legierung-hochgold", /hochgold/],
	["legierung-goldreduziert", /gold ?reduziert|edelmetall ?reduziert/],
	["implantat-abdruckpfosten", /abformpfosten|abdruckpfosten|abformkappe|abdruckkappe/],
	["implantat-scanbody", /scan ?body|scanpfosten/],
	["implantat-laboranalog", /laboranalog|implantatanalog|modellanalog/],
	["implantat-tiBase", /ti ?base|klebebasis/],
	["implantat-schraube", /prothetikschraube|abutmentschraube|halteschraube|okklusalschraube/],
	["implantat-abutmentStandard", /abutment.*(konfektion|titan|standard|gerade)|(konfektion|titan|standard).*abutment/]
];
/** gleiche Nummer: der Text muss nur erkennbar dieselbe Leistung meinen */
var NUMMER_MIN = .35;
/** andere Nummer: der Text muss klar passen und deutlich besser als der nächstbeste */
var TEXT_MIN = .72;
var TEXT_ABSTAND = .06;
/** gleiche Nummer, aber der Text ist fast wörtlich eine andere Leistung: die gilt */
var UMZUG_MIN = .85;
/** Zuordnung, die PlanR einer Position vorschlägt (undefined = keine – nur über die Suche) */
function zuordnungVorschlagen(e) {
	const text = e.text ?? "";
	if (e.ersetzt?.trim() && e.quelle !== "pvs") return {
		fuer: bebNorm(e.ersetzt),
		grund: "eingetragen"
	};
	const nr = e.ersetzt?.trim() || e.nr.trim();
	const kandidat = /^\d{1,4}$/.test(nr) ? NACH_NR.get(bebNorm(nr)) : NACH_NR.get(nr.toUpperCase());
	if (kandidat && /^D\d{3}$/.test(kandidat.nr)) return {
		fuer: kandidat.nr,
		grund: "nummer"
	};
	const pw = {
		w: woerter(text),
		gekuerzt: text.trim().length >= 38
	};
	const ueberText = () => {
		if (!pw.w.length) return void 0;
		const nichtMetall = pw.w.some((w) => NICHT_METALL.has(w)) && pw.w.some((w) => RESTAURATION.test(w)) && !pw.w.includes("verblendung") && !/\bfuer (keramik|kunststoff|komposit|polymer|kst)/.test(klein(text));
		const treffer = VOKABULAR.filter((v) => !nichtMetall || v.texte.some((t) => t.some((w) => WERKSTOFF.test(w)))).map((v) => ({
			v,
			a: aehnlichsterText(pw, v)
		})).sort((x, y) => y.a - x.a);
		const beste = treffer[0];
		const zweite = treffer.find((x) => x.v.text !== beste?.v.text)?.a ?? 0;
		return beste && beste.a >= TEXT_MIN && beste.a - zweite >= TEXT_ABSTAND ? {
			fuer: beste.v.nr,
			wenn: ablaufVon(text, beste.v),
			grund: "text",
			aehnlich: beste.a
		} : void 0;
	};
	if (kandidat) {
		const a = aehnlichsterText(pw, kandidat, true);
		if (a >= NUMMER_MIN) {
			const anders = a < TEXT_MIN ? ueberText() : void 0;
			if (anders && anders.fuer !== kandidat.nr && (anders.aehnlich ?? 0) >= UMZUG_MIN && (anders.aehnlich ?? 0) - a >= .3) return anders;
			return {
				fuer: kandidat.nr,
				wenn: ablaufVon(text, kandidat),
				grund: "nummer",
				aehnlich: a
			};
		}
	}
	const t = klein(text).replace(/[^a-z0-9]+/g, " ");
	for (const [rolle, ja, nein] of ROLLEN_REGELN) if (ja.test(t) && !nein?.test(t)) return {
		fuer: rolleZiel(rolle),
		grund: "rolle"
	};
	return ueberText();
}
var zugeordnet$1 = /* @__PURE__ */ new WeakMap();
/**
* Katalog mit Zuordnung: von Hand festgelegte bleiben, alle anderen bekommen den Vorschlag (fuer '' = keiner).
* Das Ergebnis wird je Katalog zwischengespeichert.
*/
function katalogZuordnen(katalog) {
	if (!katalog) return [];
	const da = zugeordnet$1.get(katalog);
	if (da) return da;
	const neu = katalog.map((e) => {
		if (e.zuordnung === "hand") return e;
		const v = zuordnungVorschlagen(e);
		const { wenn: _, ...ohne } = e;
		return {
			...ohne,
			fuer: v?.fuer ?? "",
			...v?.wenn ? { wenn: v.wenn } : {},
			zuordnung: "auto"
		};
	});
	zugeordnet$1.set(katalog, neu);
	return neu;
}
//#endregion
//#region src/engine/berechnung.ts
var gozDaten = aktuell("goz-2012.json", goz_2012_default);
var bebDaten = aktuell("beb-itz-2024.json", beb_itz_2024_default);
var GOZ_PUNKTWERT = gozDaten.punktwert;
var GOZ = new Map(gozDaten.eintraege.map((e) => [e.nr, e]));
var BEB = new Map(bebErgaenzen({ eintraege: bebDaten.eintraege }).eintraege.map((e) => [e.nr, e]));
bebDaten.name;
var LEER = [];
var zugeordnet = /* @__PURE__ */ new WeakMap();
/** Eigenlabor der Praxis mit den digitalen Schritten, jede Position ihrem Leistungsschritt zugeordnet (wie im HKP) */
function eigenKatalog(k = LEER) {
	let z = zugeordnet.get(k);
	if (!z) zugeordnet.set(k, z = katalogZuordnen(mitDigital(k)));
	return z;
}
var runden = (x) => Math.round(x * 100) / 100;
function gozEinzel(nr, faktor) {
	return runden((GOZ.get(nr)?.punkte ?? 0) * GOZ_PUNKTWERT * faktor);
}
/** Positionen aus Planung + Reglern + Anpassungen + manuellen Einträgen zusammenführen */
function positionen(plan) {
	const { positionen: auto, hinweise } = planen(plan.zaehne, plan.abformung, plan.implantat, plan.abformungProthese ?? "");
	const r = plan.regler;
	const zusatz = zusatzleistungen({
		zaehne: plan.zaehne,
		abformung: plan.abformung,
		basis: [...auto, ...plan.manuell],
		gozStufe: r.gozStufe,
		laborStufe: r.laborStufe,
		aus: r.aus
	});
	const entfernt = new Set(plan.entfernt);
	const anpassen = (ps) => ps.filter((p) => !entfernt.has(p.id)).map((p) => ({
		...p,
		...plan.anpassungen[p.id]
	}));
	const ohneSintern = new Set(kronenEinheiten(auto.filter((p) => p.ebene === "BEB")).filter((e) => e.art === "keramik" && werkstoffVon(e, plan.werkstoffe ?? {}).werkstoff !== "zirkon").map((e) => e.zahn));
	const angepasst = anpassen([...auto, ...zusatz.positionen]).filter((p) => !(p.auto && p.ebene === "BEB" && p.nr === DIGITAL_BEB.sintern && ohneSintern.has(p.zahn)));
	const mat = materialErmitteln([...angepasst, ...plan.manuell].filter((p) => p.ebene === "BEB"), plan.werkstoffe ?? {});
	const material = anpassen(mat.zeilen.map((z) => ({
		id: `mat:${z.zahn}`,
		ebene: "MAT",
		nr: "",
		zahn: z.zahn,
		anzahl: z.menge,
		preis: z.einzel,
		text: z.text,
		auto: true,
		material: true
	})));
	return {
		positionen: [
			...angepasst,
			...plan.manuell,
			...material
		],
		hinweise: [...hinweise, ...mat.hinweise],
		nichtAngesetzt: zusatz.nichtAngesetzt
	};
}
function kalkulieren(plan, e) {
	const { positionen: alle, hinweise, nichtAngesetzt } = positionen(plan);
	const standardFaktor = plan.regler.gozFaktor > 0 ? plan.regler.gozFaktor : e.gozFaktor;
	const aufschlag = Math.min(Math.max(plan.regler.laborAufschlag, -30), 100);
	const honorar = [];
	const labor = [];
	const material = [];
	for (const p of alle) if (p.ebene === "GOZ") {
		const eintrag = GOZ.get(p.nr);
		const faktor = p.faktor ?? standardFaktor;
		const einzel = gozEinzel(p.nr, faktor);
		if (!eintrag) hinweise.push(`GOZ ${p.nr} ist im Gebührenverzeichnis nicht vorhanden.`);
		if (faktor > 3.5) hinweise.push(`GOZ ${p.nr}: Faktor ${faktor.toFixed(1).replace(".", ",")} über 3,5 erfordert eine schriftliche Vereinbarung nach § 2 GOZ vor Behandlungsbeginn.`);
		honorar.push({
			...p,
			faktor,
			einzel,
			punkte: eintrag?.punkte,
			text: p.text || eintrag?.text || "–",
			begruendung: faktor > 2.3 ? p.begruendung || standardBegruendung(p.nr) : void 0,
			betrag: runden(einzel * p.anzahl)
		});
	} else if (p.ebene === "BEB") {
		const eigen = eigenFinden(eigenKatalog(e.eigenlabor), p.nr, {
			ablauf: plan.abformung,
			auto: p.auto
		});
		if (eigen) {
			const einzel = runden(p.preis ?? eigen.preis);
			labor.push({
				...p,
				eigen: eigen.nr,
				einzel,
				text: p.text || eigen.text,
				betrag: runden(einzel * p.anzahl)
			});
			continue;
		}
		const eintrag = BEB.get(p.nr);
		const einzel = runden(p.preis ?? (eintrag?.preis ?? 0) * (1 + aufschlag / 100));
		if (!eintrag && p.preis === void 0) hinweise.push(`BEB ${p.nr} ist in der Laborpreisliste nicht vorhanden – Preis bitte eintragen.`);
		labor.push({
			...p,
			einzel,
			text: p.text || eintrag?.text || "–",
			betrag: runden(einzel * p.anzahl)
		});
	} else {
		const einzel = runden(p.preis ?? 0);
		(p.material ? labor : material).push({
			...p,
			einzel,
			text: p.text || "Material",
			betrag: runden(einzel * p.anzahl)
		});
	}
	const sortieren = (a, b) => Number(!!a.material) - Number(!!b.material) || a.nr.localeCompare(b.nr) || a.zahn.localeCompare(b.zahn);
	honorar.sort(sortieren);
	labor.sort(sortieren);
	const summe = (z) => runden(z.reduce((s, x) => s + x.betrag, 0));
	const summeHonorar = summe(honorar);
	const summeLaborNetto = summe(labor);
	const mwst = runden(summeLaborNetto * e.mwst / 100);
	const summeMaterial = summe(material);
	return {
		honorar,
		labor,
		material,
		summeHonorar,
		summeLaborNetto,
		mwst,
		mwstSatz: e.mwst,
		summeMaterial,
		gesamt: runden(summeHonorar + summeLaborNetto + mwst + summeMaterial),
		hinweise,
		nichtAngesetzt
	};
}
//#endregion
//#region node_modules/react/cjs/react.production.js
/**
* @license React
* react.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
	var REACT_PORTAL_TYPE = Symbol.for("react.portal");
	var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
	var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
	var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
	var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
	var REACT_CONTEXT_TYPE = Symbol.for("react.context");
	var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
	var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
	var REACT_MEMO_TYPE = Symbol.for("react.memo");
	var REACT_LAZY_TYPE = Symbol.for("react.lazy");
	var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
	var REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition");
	var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
	function getIteratorFn(maybeIterable) {
		if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
		maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
		return "function" === typeof maybeIterable ? maybeIterable : null;
	}
	var ReactNoopUpdateQueue = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	};
	var assign = Object.assign;
	var emptyObject = {};
	function Component(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	Component.prototype.isReactComponent = {};
	Component.prototype.setState = function(partialState, callback) {
		if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, partialState, callback, "setState");
	};
	Component.prototype.forceUpdate = function(callback) {
		this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
	};
	function ComponentDummy() {}
	ComponentDummy.prototype = Component.prototype;
	function PureComponent(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
	pureComponentPrototype.constructor = PureComponent;
	assign(pureComponentPrototype, Component.prototype);
	pureComponentPrototype.isPureReactComponent = !0;
	var isArrayImpl = Array.isArray;
	function noop() {}
	var ReactSharedInternals = {
		H: null,
		A: null,
		T: null,
		S: null
	};
	var hasOwnProperty = Object.prototype.hasOwnProperty;
	function ReactElement(type, key, props) {
		var refProp = props.ref;
		return {
			$$typeof: REACT_ELEMENT_TYPE,
			type,
			key,
			ref: void 0 !== refProp ? refProp : null,
			props
		};
	}
	function cloneAndReplaceKey(oldElement, newKey) {
		return ReactElement(oldElement.type, newKey, oldElement.props);
	}
	function isValidElement(object) {
		return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
	}
	function escape(key) {
		var escaperLookup = {
			"=": "=0",
			":": "=2"
		};
		return "$" + key.replace(/[=:]/g, function(match) {
			return escaperLookup[match];
		});
	}
	var userProvidedKeyEscapeRegex = /\/+/g;
	function getElementKey(element, index) {
		return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
	}
	function resolveThenable(thenable) {
		switch (thenable.status) {
			case "fulfilled": return thenable.value;
			case "rejected": throw thenable.reason;
			default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
				"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
			}, function(error) {
				"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
			})), thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
			}
		}
		throw thenable;
	}
	function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
		var type = typeof children;
		if ("undefined" === type || "boolean" === type) children = null;
		var invokeCallback = !1;
		if (null === children) invokeCallback = !0;
		else switch (type) {
			case "bigint":
			case "string":
			case "number":
				invokeCallback = !0;
				break;
			case "object": switch (children.$$typeof) {
				case REACT_ELEMENT_TYPE:
				case REACT_PORTAL_TYPE:
					invokeCallback = !0;
					break;
				case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
			}
		}
		if (invokeCallback) return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
			return c;
		})) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + invokeCallback)), array.push(callback)), 1;
		invokeCallback = 0;
		var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
		if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if (i = getIteratorFn(children), "function" === typeof i) for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if ("object" === type) {
			if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
			array = String(children);
			throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
		}
		return invokeCallback;
	}
	function mapChildren(children, func, context) {
		if (null == children) return children;
		var result = [], count = 0;
		mapIntoArray(children, result, "", "", function(child) {
			return func.call(context, child, count++);
		});
		return result;
	}
	function lazyInitializer(payload) {
		if (-1 === payload._status) {
			var ctor = payload._result, thenable = ctor();
			thenable.then(function(moduleObject) {
				if (0 === payload._status || -1 === payload._status) payload._status = 1, payload._result = moduleObject, void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
			}, function(error) {
				if (0 === payload._status || -1 === payload._status) payload._status = 2, payload._result = error, void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
			});
			-1 === payload._status && (payload._status = 0, payload._result = thenable);
		}
		if (1 === payload._status) return payload._result.default;
		throw payload._result;
	}
	var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
		if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
			var event = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
				error
			});
			if (!window.dispatchEvent(event)) return;
		} else if ("object" === typeof process && "function" === typeof process.emit) {
			process.emit("uncaughtException", error);
			return;
		}
		console.error(error);
	};
	function startTransition(scope) {
		var prevTransition = ReactSharedInternals.T, currentTransition = {};
		currentTransition.types = null !== prevTransition ? prevTransition.types : null;
		ReactSharedInternals.T = currentTransition;
		try {
			var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
			null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
			"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
		} catch (error) {
			reportGlobalError(error);
		} finally {
			null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
		}
	}
	function addTransitionType(type) {
		var transition = ReactSharedInternals.T;
		if (null !== transition) {
			var transitionTypes = transition.types;
			null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
		} else startTransition(addTransitionType.bind(null, type));
	}
	var Children = {
		map: mapChildren,
		forEach: function(children, forEachFunc, forEachContext) {
			mapChildren(children, function() {
				forEachFunc.apply(this, arguments);
			}, forEachContext);
		},
		count: function(children) {
			var n = 0;
			mapChildren(children, function() {
				n++;
			});
			return n;
		},
		toArray: function(children) {
			return mapChildren(children, function(child) {
				return child;
			}) || [];
		},
		only: function(children) {
			if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
			return children;
		}
	};
	exports.Activity = REACT_ACTIVITY_TYPE;
	exports.Children = Children;
	exports.Component = Component;
	exports.Fragment = REACT_FRAGMENT_TYPE;
	exports.Profiler = REACT_PROFILER_TYPE;
	exports.PureComponent = PureComponent;
	exports.StrictMode = REACT_STRICT_MODE_TYPE;
	exports.Suspense = REACT_SUSPENSE_TYPE;
	exports.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
	exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
	exports.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(size) {
			return ReactSharedInternals.H.useMemoCache(size);
		}
	};
	exports.addTransitionType = addTransitionType;
	exports.cache = function(fn) {
		return function() {
			return fn.apply(null, arguments);
		};
	};
	exports.cacheSignal = function() {
		return null;
	};
	exports.cloneElement = function(element, config, children) {
		if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
		var props = assign({}, element.props), key = element.key;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
		var propName = arguments.length - 2;
		if (1 === propName) props.children = children;
		else if (1 < propName) {
			for (var childArray = Array(propName), i = 0; i < propName; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		return ReactElement(element.type, key, props);
	};
	exports.createContext = function(defaultValue) {
		defaultValue = {
			$$typeof: REACT_CONTEXT_TYPE,
			_currentValue: defaultValue,
			_currentValue2: defaultValue,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		};
		defaultValue.Provider = defaultValue;
		defaultValue.Consumer = {
			$$typeof: REACT_CONSUMER_TYPE,
			_context: defaultValue
		};
		return defaultValue;
	};
	exports.createElement = function(type, config, children) {
		var propName, props = {}, key = null;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
		var childrenLength = arguments.length - 2;
		if (1 === childrenLength) props.children = children;
		else if (1 < childrenLength) {
			for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === props[propName] && (props[propName] = childrenLength[propName]);
		return ReactElement(type, key, props);
	};
	exports.createRef = function() {
		return { current: null };
	};
	exports.forwardRef = function(render) {
		return {
			$$typeof: REACT_FORWARD_REF_TYPE,
			render
		};
	};
	exports.isValidElement = isValidElement;
	exports.lazy = function(ctor) {
		return {
			$$typeof: REACT_LAZY_TYPE,
			_payload: {
				_status: -1,
				_result: ctor
			},
			_init: lazyInitializer
		};
	};
	exports.memo = function(type, compare) {
		return {
			$$typeof: REACT_MEMO_TYPE,
			type,
			compare: void 0 === compare ? null : compare
		};
	};
	exports.startTransition = startTransition;
	exports.unstable_useCacheRefresh = function() {
		return ReactSharedInternals.H.useCacheRefresh();
	};
	exports.use = function(usable) {
		return ReactSharedInternals.H.use(usable);
	};
	exports.useActionState = function(action, initialState, permalink) {
		return ReactSharedInternals.H.useActionState(action, initialState, permalink);
	};
	exports.useCallback = function(callback, deps) {
		return ReactSharedInternals.H.useCallback(callback, deps);
	};
	exports.useContext = function(Context) {
		return ReactSharedInternals.H.useContext(Context);
	};
	exports.useDebugValue = function() {};
	exports.useDeferredValue = function(value, initialValue) {
		return ReactSharedInternals.H.useDeferredValue(value, initialValue);
	};
	exports.useEffect = function(create, deps) {
		return ReactSharedInternals.H.useEffect(create, deps);
	};
	exports.useEffectEvent = function(callback) {
		return ReactSharedInternals.H.useEffectEvent(callback);
	};
	exports.useId = function() {
		return ReactSharedInternals.H.useId();
	};
	exports.useImperativeHandle = function(ref, create, deps) {
		return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
	};
	exports.useInsertionEffect = function(create, deps) {
		return ReactSharedInternals.H.useInsertionEffect(create, deps);
	};
	exports.useLayoutEffect = function(create, deps) {
		return ReactSharedInternals.H.useLayoutEffect(create, deps);
	};
	exports.useMemo = function(create, deps) {
		return ReactSharedInternals.H.useMemo(create, deps);
	};
	exports.useOptimistic = function(passthrough, reducer) {
		return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
	};
	exports.useReducer = function(reducer, initialArg, init) {
		return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
	};
	exports.useRef = function(initialValue) {
		return ReactSharedInternals.H.useRef(initialValue);
	};
	exports.useState = function(initialState) {
		return ReactSharedInternals.H.useState(initialState);
	};
	exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
		return ReactSharedInternals.H.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	};
	exports.useTransition = function() {
		return ReactSharedInternals.H.useTransition();
	};
	exports.version = "19.3.0";
}));
//#endregion
//#region node_modules/react/cjs/react.development.js
/**
* @license React
* react.development.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_development = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	"production" !== process.env.NODE_ENV && (function() {
		function defineDeprecationWarning(methodName, info) {
			Object.defineProperty(Component.prototype, methodName, { get: function() {
				console.warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
			} });
		}
		function getIteratorFn(maybeIterable) {
			if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
			maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
			return "function" === typeof maybeIterable ? maybeIterable : null;
		}
		function warnNoop(publicInstance, callerName) {
			publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
			var warningKey = publicInstance + "." + callerName;
			didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, publicInstance), didWarnStateUpdateForUnmountedComponent[warningKey] = !0);
		}
		function Component(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function ComponentDummy() {}
		function PureComponent(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function noop() {}
		function testStringCoercion(value) {
			return "" + value;
		}
		function checkKeyStringCoercion(value) {
			try {
				testStringCoercion(value);
				var JSCompiler_inline_result = !1;
			} catch (e) {
				JSCompiler_inline_result = !0;
			}
			if (JSCompiler_inline_result) {
				JSCompiler_inline_result = console;
				var JSCompiler_temp_const = JSCompiler_inline_result.error;
				var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
				JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
				return testStringCoercion(value);
			}
		}
		function getComponentNameFromType(type) {
			if (null == type) return null;
			if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
			if ("string" === typeof type) return type;
			switch (type) {
				case REACT_FRAGMENT_TYPE: return "Fragment";
				case REACT_PROFILER_TYPE: return "Profiler";
				case REACT_STRICT_MODE_TYPE: return "StrictMode";
				case REACT_SUSPENSE_TYPE: return "Suspense";
				case REACT_SUSPENSE_LIST_TYPE: return "SuspenseList";
				case REACT_ACTIVITY_TYPE: return "Activity";
				case REACT_VIEW_TRANSITION_TYPE: return "ViewTransition";
			}
			if ("object" === typeof type) switch ("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof) {
				case REACT_PORTAL_TYPE: return "Portal";
				case REACT_CONTEXT_TYPE: return type.displayName || "Context";
				case REACT_CONSUMER_TYPE: return (type._context.displayName || "Context") + ".Consumer";
				case REACT_FORWARD_REF_TYPE:
					var innerType = type.render;
					type = type.displayName;
					type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
					return type;
				case REACT_MEMO_TYPE: return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
				case REACT_LAZY_TYPE:
					innerType = type._payload;
					type = type._init;
					try {
						return getComponentNameFromType(type(innerType));
					} catch (x) {}
			}
			return null;
		}
		function getTaskName(type) {
			if (type === REACT_FRAGMENT_TYPE) return "<>";
			if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
			try {
				var name = getComponentNameFromType(type);
				return name ? "<" + name + ">" : "<...>";
			} catch (x) {
				return "<...>";
			}
		}
		function getOwner() {
			var dispatcher = ReactSharedInternals.A;
			return null === dispatcher ? null : dispatcher.getOwner();
		}
		function UnknownOwner() {
			return Error("react-stack-top-frame");
		}
		function hasValidKey(config) {
			if (hasOwnProperty.call(config, "key")) {
				var getter = Object.getOwnPropertyDescriptor(config, "key").get;
				if (getter && getter.isReactWarning) return !1;
			}
			return void 0 !== config.key;
		}
		function defineKeyPropWarningGetter(props, displayName) {
			function warnAboutAccessingKey() {
				specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
			}
			warnAboutAccessingKey.isReactWarning = !0;
			Object.defineProperty(props, "key", {
				get: warnAboutAccessingKey,
				configurable: !0
			});
		}
		function elementRefGetterWithDeprecationWarning() {
			var componentName = getComponentNameFromType(this.type);
			didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
			componentName = this.props.ref;
			return void 0 !== componentName ? componentName : null;
		}
		function ReactElement(type, key, props, owner, debugStack, debugTask) {
			var refProp = props.ref;
			type = {
				$$typeof: REACT_ELEMENT_TYPE,
				type,
				key,
				props,
				_owner: owner
			};
			null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
				enumerable: !1,
				get: elementRefGetterWithDeprecationWarning
			}) : Object.defineProperty(type, "ref", {
				enumerable: !1,
				value: null
			});
			type._store = {};
			Object.defineProperty(type._store, "validated", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: 0
			});
			Object.defineProperty(type, "_debugInfo", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: null
			});
			Object.defineProperty(type, "_debugStack", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugStack
			});
			Object.defineProperty(type, "_debugTask", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugTask
			});
			Object.freeze && (Object.freeze(type.props), Object.freeze(type));
			return type;
		}
		function cloneAndReplaceKey(oldElement, newKey) {
			newKey = ReactElement(oldElement.type, newKey, oldElement.props, oldElement._owner, oldElement._debugStack, oldElement._debugTask);
			oldElement._store && (newKey._store.validated = oldElement._store.validated);
			return newKey;
		}
		function validateChildKeys(node) {
			isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
		}
		function isValidElement(object) {
			return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
		}
		function escape(key) {
			var escaperLookup = {
				"=": "=0",
				":": "=2"
			};
			return "$" + key.replace(/[=:]/g, function(match) {
				return escaperLookup[match];
			});
		}
		function getElementKey(element, index) {
			return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
		}
		function resolveThenable(thenable) {
			switch (thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
				default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
					"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
				}, function(error) {
					"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
				})), thenable.status) {
					case "fulfilled": return thenable.value;
					case "rejected": throw thenable.reason;
				}
			}
			throw thenable;
		}
		function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
			var type = typeof children;
			if ("undefined" === type || "boolean" === type) children = null;
			var invokeCallback = !1;
			if (null === children) invokeCallback = !0;
			else switch (type) {
				case "bigint":
				case "string":
				case "number":
					invokeCallback = !0;
					break;
				case "object": switch (children.$$typeof) {
					case REACT_ELEMENT_TYPE:
					case REACT_PORTAL_TYPE:
						invokeCallback = !0;
						break;
					case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
				}
			}
			if (invokeCallback) {
				invokeCallback = children;
				callback = callback(invokeCallback);
				var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
				isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
					return c;
				})) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + childKey), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
				return 1;
			}
			invokeCallback = 0;
			childKey = "" === nameSoFar ? "." : nameSoFar + ":";
			if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if (i = getIteratorFn(children), "function" === typeof i) for (i === children.entries && (didWarnAboutMaps || console.warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead."), didWarnAboutMaps = !0), children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if ("object" === type) {
				if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
				array = String(children);
				throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
			}
			return invokeCallback;
		}
		function mapChildren(children, func, context) {
			if (null == children) return children;
			var result = [], count = 0;
			mapIntoArray(children, result, "", "", function(child) {
				return func.call(context, child, count++);
			});
			return result;
		}
		function lazyInitializer(payload) {
			if (-1 === payload._status) {
				var resolveDebugValue = null, rejectDebugValue = null, ioInfo = payload._ioInfo;
				null != ioInfo && (ioInfo.start = ioInfo.end = performance.now(), ioInfo.value = new Promise(function(resolve, reject) {
					resolveDebugValue = resolve;
					rejectDebugValue = reject;
				}));
				ioInfo = payload._result;
				var thenable = ioInfo();
				thenable.then(function(moduleObject) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 1;
						payload._result = moduleObject;
						var _ioInfo = payload._ioInfo;
						if (null != _ioInfo) {
							_ioInfo.end = performance.now();
							var debugValue = null == moduleObject ? void 0 : moduleObject.default;
							resolveDebugValue(debugValue);
							_ioInfo.value.status = "fulfilled";
							_ioInfo.value.value = debugValue;
						}
						void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
					}
				}, function(error) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 2;
						payload._result = error;
						var _ioInfo2 = payload._ioInfo;
						null != _ioInfo2 && (_ioInfo2.end = performance.now(), _ioInfo2.value.then(noop, noop), rejectDebugValue(error), _ioInfo2.value.status = "rejected", _ioInfo2.value.reason = error);
						void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
					}
				});
				ioInfo = payload._ioInfo;
				if (null != ioInfo) {
					var displayName = thenable.displayName;
					"string" === typeof displayName && (ioInfo.name = displayName);
				}
				-1 === payload._status && (payload._status = 0, payload._result = thenable);
			}
			if (1 === payload._status) return ioInfo = payload._result, void 0 === ioInfo && console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", ioInfo), "default" in ioInfo || console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", ioInfo), ioInfo.default;
			throw payload._result;
		}
		function resolveDispatcher() {
			var dispatcher = ReactSharedInternals.H;
			null === dispatcher && console.error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.");
			return dispatcher;
		}
		function releaseAsyncTransition() {
			ReactSharedInternals.asyncTransitions--;
		}
		function startTransition(scope) {
			var prevTransition = ReactSharedInternals.T, currentTransition = {};
			currentTransition.types = null !== prevTransition ? prevTransition.types : null;
			currentTransition._updatedFibers = /* @__PURE__ */ new Set();
			ReactSharedInternals.T = currentTransition;
			try {
				var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
				null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
				"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
			} catch (error) {
				reportGlobalError(error);
			} finally {
				null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.")), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
			}
		}
		function addTransitionType(type) {
			var transition = ReactSharedInternals.T;
			if (null !== transition) {
				var transitionTypes = transition.types;
				null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
			} else 0 === ReactSharedInternals.asyncTransitions && console.error("addTransitionType can only be called inside a `startTransition()` callback. It must be associated with a specific Transition."), startTransition(addTransitionType.bind(null, type));
		}
		function enqueueTask(task) {
			if (null === enqueueTaskImpl) try {
				var requireString = ("require" + Math.random()).slice(0, 7);
				enqueueTaskImpl = (module && module[requireString]).call(module, "timers").setImmediate;
			} catch (_err) {
				enqueueTaskImpl = function(callback) {
					!1 === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = !0, "undefined" === typeof MessageChannel && console.error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."));
					var channel = new MessageChannel();
					channel.port1.onmessage = callback;
					channel.port2.postMessage(void 0);
				};
			}
			return enqueueTaskImpl(task);
		}
		function aggregateErrors(errors) {
			return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
		}
		function popActScope(prevActQueue, prevActScopeDepth) {
			prevActScopeDepth !== actScopeDepth - 1 && console.error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
			actScopeDepth = prevActScopeDepth;
		}
		function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
			var queue = ReactSharedInternals.actQueue;
			if (null !== queue) if (0 !== queue.length) try {
				flushActQueue(queue);
				enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
				});
				return;
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			else ReactSharedInternals.actQueue = null;
			0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
		}
		function flushActQueue(queue) {
			if (!isFlushing) {
				isFlushing = !0;
				var i = 0;
				try {
					for (; i < queue.length; i++) {
						var callback = queue[i];
						do {
							ReactSharedInternals.didUsePromise = !1;
							var continuation = callback(!1);
							if (null !== continuation) {
								if (ReactSharedInternals.didUsePromise) {
									queue[i] = callback;
									queue.splice(0, i);
									return;
								}
								callback = continuation;
							} else break;
						} while (1);
					}
					queue.length = 0;
				} catch (error) {
					queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
				} finally {
					isFlushing = !1;
				}
			}
		}
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
			isMounted: function() {
				return !1;
			},
			enqueueForceUpdate: function(publicInstance) {
				warnNoop(publicInstance, "forceUpdate");
			},
			enqueueReplaceState: function(publicInstance) {
				warnNoop(publicInstance, "replaceState");
			},
			enqueueSetState: function(publicInstance) {
				warnNoop(publicInstance, "setState");
			}
		}, assign = Object.assign, emptyObject = {};
		Object.freeze(emptyObject);
		Component.prototype.isReactComponent = {};
		Component.prototype.setState = function(partialState, callback) {
			if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
			this.updater.enqueueSetState(this, partialState, callback, "setState");
		};
		Component.prototype.forceUpdate = function(callback) {
			this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
		};
		var deprecatedAPIs = {
			isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
			replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
		};
		for (fnName in deprecatedAPIs) deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
		ComponentDummy.prototype = Component.prototype;
		deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
		deprecatedAPIs.constructor = PureComponent;
		assign(deprecatedAPIs, Component.prototype);
		deprecatedAPIs.isPureReactComponent = !0;
		var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = {
			H: null,
			A: null,
			T: null,
			S: null,
			actQueue: null,
			asyncTransitions: 0,
			isBatchingLegacy: !1,
			didScheduleLegacyUpdate: !1,
			didUsePromise: !1,
			thrownErrors: [],
			getCurrentStack: null,
			recentlyCreatedOwnerStacks: 0
		}, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
			return null;
		};
		deprecatedAPIs = { react_stack_bottom_frame: function(callStackForError) {
			return callStackForError();
		} };
		var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
		var didWarnAboutElementRef = {};
		var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(deprecatedAPIs, UnknownOwner)();
		var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
		var didWarnAboutMaps = !1, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
			if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
				var event = new window.ErrorEvent("error", {
					bubbles: !0,
					cancelable: !0,
					message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
					error
				});
				if (!window.dispatchEvent(event)) return;
			} else if ("object" === typeof process && "function" === typeof process.emit) {
				process.emit("uncaughtException", error);
				return;
			}
			console.error(error);
		}, didWarnAboutMessageChannel = !1, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = !1, isFlushing = !1, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
			queueMicrotask(function() {
				return queueMicrotask(callback);
			});
		} : enqueueTask;
		deprecatedAPIs = Object.freeze({
			__proto__: null,
			c: function(size) {
				return resolveDispatcher().useMemoCache(size);
			}
		});
		var fnName = {
			map: mapChildren,
			forEach: function(children, forEachFunc, forEachContext) {
				mapChildren(children, function() {
					forEachFunc.apply(this, arguments);
				}, forEachContext);
			},
			count: function(children) {
				var n = 0;
				mapChildren(children, function() {
					n++;
				});
				return n;
			},
			toArray: function(children) {
				return mapChildren(children, function(child) {
					return child;
				}) || [];
			},
			only: function(children) {
				if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
				return children;
			}
		};
		exports.Activity = REACT_ACTIVITY_TYPE;
		exports.Children = fnName;
		exports.Component = Component;
		exports.Fragment = REACT_FRAGMENT_TYPE;
		exports.Profiler = REACT_PROFILER_TYPE;
		exports.PureComponent = PureComponent;
		exports.StrictMode = REACT_STRICT_MODE_TYPE;
		exports.Suspense = REACT_SUSPENSE_TYPE;
		exports.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
		exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
		exports.__COMPILER_RUNTIME = deprecatedAPIs;
		exports.act = function(callback) {
			var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
			actScopeDepth++;
			var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = !1;
			try {
				var result = callback();
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			if (0 < ReactSharedInternals.thrownErrors.length) throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			if (null !== result && "object" === typeof result && "function" === typeof result.then) {
				var thenable = result;
				queueSeveralMicrotasks(function() {
					didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"));
				});
				return { then: function(resolve, reject) {
					didAwaitActCall = !0;
					thenable.then(function(returnValue) {
						popActScope(prevActQueue, prevActScopeDepth);
						if (0 === prevActScopeDepth) {
							try {
								flushActQueue(queue), enqueueTask(function() {
									return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
								});
							} catch (error$0) {
								ReactSharedInternals.thrownErrors.push(error$0);
							}
							if (0 < ReactSharedInternals.thrownErrors.length) {
								var _thrownError = aggregateErrors(ReactSharedInternals.thrownErrors);
								ReactSharedInternals.thrownErrors.length = 0;
								reject(_thrownError);
							}
						} else resolve(returnValue);
					}, function(error) {
						popActScope(prevActQueue, prevActScopeDepth);
						0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
					});
				} };
			}
			var returnValue$jscomp$0 = result;
			popActScope(prevActQueue, prevActScopeDepth);
			0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
				didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"));
			}), ReactSharedInternals.actQueue = null);
			if (0 < ReactSharedInternals.thrownErrors.length) throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			return { then: function(resolve, reject) {
				didAwaitActCall = !0;
				0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue$jscomp$0, resolve, reject);
				})) : resolve(returnValue$jscomp$0);
			} };
		};
		exports.addTransitionType = addTransitionType;
		exports.cache = function(fn) {
			return function() {
				return fn.apply(null, arguments);
			};
		};
		exports.cacheSignal = function() {
			return null;
		};
		exports.captureOwnerStack = function() {
			var getCurrentStack = ReactSharedInternals.getCurrentStack;
			return null === getCurrentStack ? null : getCurrentStack();
		};
		exports.cloneElement = function(element, config, children) {
			if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
			var props = assign({}, element.props), key = element.key, owner = element._owner;
			if (null != config) {
				var JSCompiler_inline_result;
				a: {
					if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(config, "ref").get) && JSCompiler_inline_result.isReactWarning) {
						JSCompiler_inline_result = !1;
						break a;
					}
					JSCompiler_inline_result = void 0 !== config.ref;
				}
				JSCompiler_inline_result && (owner = getOwner());
				hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
				for (propName in config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
			}
			var propName = arguments.length - 2;
			if (1 === propName) props.children = children;
			else if (1 < propName) {
				JSCompiler_inline_result = Array(propName);
				for (var i = 0; i < propName; i++) JSCompiler_inline_result[i] = arguments[i + 2];
				props.children = JSCompiler_inline_result;
			}
			props = ReactElement(element.type, key, props, owner, element._debugStack, element._debugTask);
			for (key = 2; key < arguments.length; key++) validateChildKeys(arguments[key]);
			return props;
		};
		exports.createContext = function(defaultValue) {
			defaultValue = {
				$$typeof: REACT_CONTEXT_TYPE,
				_currentValue: defaultValue,
				_currentValue2: defaultValue,
				_threadCount: 0,
				Provider: null,
				Consumer: null
			};
			defaultValue.Provider = defaultValue;
			defaultValue.Consumer = {
				$$typeof: REACT_CONSUMER_TYPE,
				_context: defaultValue
			};
			defaultValue._currentRenderer = null;
			defaultValue._currentRenderer2 = null;
			return defaultValue;
		};
		exports.createElement = function(type, config, children) {
			for (var i = 2; i < arguments.length; i++) validateChildKeys(arguments[i]);
			var propName;
			i = {};
			var key = null;
			if (null != config) for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = !0, console.warn("Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform")), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
			var childrenLength = arguments.length - 2;
			if (1 === childrenLength) i.children = children;
			else if (1 < childrenLength) {
				for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++) childArray[_i] = arguments[_i + 2];
				Object.freeze && Object.freeze(childArray);
				i.children = childArray;
			}
			if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === i[propName] && (i[propName] = childrenLength[propName]);
			key && defineKeyPropWarningGetter(i, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
			(propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++) ? (childArray = Error.stackTraceLimit, Error.stackTraceLimit = 10, childrenLength = Error("react-stack-top-frame"), Error.stackTraceLimit = childArray) : childrenLength = unknownOwnerDebugStack;
			return ReactElement(type, key, i, getOwner(), childrenLength, propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
		};
		exports.createRef = function() {
			var refObject = { current: null };
			Object.seal(refObject);
			return refObject;
		};
		exports.forwardRef = function(render) {
			null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).") : "function" !== typeof render ? console.error("forwardRef requires a render function but was given %s.", null === render ? "null" : typeof render) : 0 !== render.length && 2 !== render.length && console.error("forwardRef render functions accept exactly two parameters: props and ref. %s", 1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
			null != render && null != render.defaultProps && console.error("forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?");
			var elementType = {
				$$typeof: REACT_FORWARD_REF_TYPE,
				render
			}, ownName;
			Object.defineProperty(elementType, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
				}
			});
			return elementType;
		};
		exports.isValidElement = isValidElement;
		exports.lazy = function(ctor) {
			ctor = {
				_status: -1,
				_result: ctor
			};
			var lazyType = {
				$$typeof: REACT_LAZY_TYPE,
				_payload: ctor,
				_init: lazyInitializer
			}, ioInfo = {
				name: "lazy",
				start: -1,
				end: -1,
				value: null,
				owner: null,
				debugStack: Error("react-stack-top-frame"),
				debugTask: console.createTask ? console.createTask("lazy()") : null
			};
			ctor._ioInfo = ioInfo;
			lazyType._debugInfo = [{ awaited: ioInfo }];
			return lazyType;
		};
		exports.memo = function(type, compare) {
			type ?? console.error("memo: The first argument must be a component. Instead received: %s", null === type ? "null" : typeof type);
			compare = {
				$$typeof: REACT_MEMO_TYPE,
				type,
				compare: void 0 === compare ? null : compare
			};
			var ownName;
			Object.defineProperty(compare, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
				}
			});
			return compare;
		};
		exports.startTransition = startTransition;
		exports.unstable_useCacheRefresh = function() {
			return resolveDispatcher().useCacheRefresh();
		};
		exports.use = function(usable) {
			return resolveDispatcher().use(usable);
		};
		exports.useActionState = function(action, initialState, permalink) {
			return resolveDispatcher().useActionState(action, initialState, permalink);
		};
		exports.useCallback = function(callback, deps) {
			return resolveDispatcher().useCallback(callback, deps);
		};
		exports.useContext = function(Context) {
			var dispatcher = resolveDispatcher();
			Context.$$typeof === REACT_CONSUMER_TYPE && console.error("Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?");
			return dispatcher.useContext(Context);
		};
		exports.useDebugValue = function(value, formatterFn) {
			return resolveDispatcher().useDebugValue(value, formatterFn);
		};
		exports.useDeferredValue = function(value, initialValue) {
			return resolveDispatcher().useDeferredValue(value, initialValue);
		};
		exports.useEffect = function(create, deps) {
			create ?? console.warn("React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useEffect(create, deps);
		};
		exports.useEffectEvent = function(callback) {
			return resolveDispatcher().useEffectEvent(callback);
		};
		exports.useId = function() {
			return resolveDispatcher().useId();
		};
		exports.useImperativeHandle = function(ref, create, deps) {
			return resolveDispatcher().useImperativeHandle(ref, create, deps);
		};
		exports.useInsertionEffect = function(create, deps) {
			create ?? console.warn("React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useInsertionEffect(create, deps);
		};
		exports.useLayoutEffect = function(create, deps) {
			create ?? console.warn("React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useLayoutEffect(create, deps);
		};
		exports.useMemo = function(create, deps) {
			return resolveDispatcher().useMemo(create, deps);
		};
		exports.useOptimistic = function(passthrough, reducer) {
			return resolveDispatcher().useOptimistic(passthrough, reducer);
		};
		exports.useReducer = function(reducer, initialArg, init) {
			return resolveDispatcher().useReducer(reducer, initialArg, init);
		};
		exports.useRef = function(initialValue) {
			return resolveDispatcher().useRef(initialValue);
		};
		exports.useState = function(initialState) {
			return resolveDispatcher().useState(initialState);
		};
		exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
			return resolveDispatcher().useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
		};
		exports.useTransition = function() {
			return resolveDispatcher().useTransition();
		};
		exports.version = "19.3.0";
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
	})();
}));
(/* @__PURE__ */ __commonJSMin(((exports, module) => {
	if (process.env.NODE_ENV === "production") module.exports = require_react_production();
	else module.exports = require_react_development();
})))();
var leererPatient = () => ({
	anrede: "",
	titel: "",
	vorname: "",
	name: "",
	geburtsdatum: "",
	strasse: "",
	plz: "",
	ort: "",
	kasse: "",
	kassenNr: "",
	versichertenNr: "",
	status: "",
	kassenart: "primaer",
	email: ""
});
var standardPraxis = () => ({
	name: "Zahnarztpraxis",
	zahnarzt: "",
	strasse: "",
	plz: "",
	ort: "",
	telefon: "",
	email: "",
	zahnarztNr: "",
	abrechnungsNr: "",
	kzvNr: ""
});
/** Praxiskopf vom PlanR-Server (/api/praxisdaten); alle Planer teilen sich diesen Speicher. */
var ZENTRALE_PRAXIS_KEY = "planr.praxis.zentral.v1";
//#endregion
//#region src/arzt.ts
var ARZT_KEY = "planr.arzt.v1";
var ARZT_EREIGNIS = "planr-arzt";
var STEMPEL_BLAU = "#1c3f94";
function arztLesen() {
	try {
		const r = typeof localStorage === "undefined" ? null : JSON.parse(localStorage.getItem("planr.arzt.v1") ?? "null");
		return r && typeof r === "object" && typeof r.name === "string" ? r : null;
	} catch {
		return null;
	}
}
var kennung = (s) => `${s.length}:${s.slice(-48)}`;
/** Dunkle Striche → Stempelblau, Hintergrund (weiß oder transparent) → durchsichtig. */
function blauFaerben(dataUrl) {
	return new Promise((fertig) => {
		if (!dataUrl || typeof document === "undefined") return fertig(dataUrl);
		const bild = new Image();
		bild.onload = () => {
			const c = document.createElement("canvas");
			c.width = bild.naturalWidth;
			c.height = bild.naturalHeight;
			const ctx = c.getContext("2d");
			if (!ctx || !c.width || !c.height) return fertig(dataUrl);
			ctx.drawImage(bild, 0, 0);
			const d = ctx.getImageData(0, 0, c.width, c.height);
			const [r, g, b] = [
				1,
				3,
				5
			].map((i) => parseInt(STEMPEL_BLAU.slice(i, i + 2), 16));
			let [x0, y0, x1, y1] = [
				c.width,
				c.height,
				-1,
				-1
			];
			for (let i = 0; i < d.data.length; i += 4) {
				const hell = (d.data[i] * 299 + d.data[i + 1] * 587 + d.data[i + 2] * 114) / 1e3;
				const roh = d.data[i + 3] * (255 - hell) / 255;
				const deckung = roh < 12 ? 0 : Math.min(255, roh * 2.2);
				d.data[i] = r;
				d.data[i + 1] = g;
				d.data[i + 2] = b;
				d.data[i + 3] = deckung;
				if (deckung) {
					const p = i / 4;
					const [x, y] = [p % c.width, Math.floor(p / c.width)];
					x0 = Math.min(x0, x);
					x1 = Math.max(x1, x);
					y0 = Math.min(y0, y);
					y1 = Math.max(y1, y);
				}
			}
			if (x1 < 0) return fertig("");
			ctx.putImageData(d, 0, 0);
			const rand = 4;
			const [x, y] = [Math.max(0, x0 - rand), Math.max(0, y0 - rand)];
			const zu = document.createElement("canvas");
			zu.width = Math.min(c.width, x1 + rand + 1) - x;
			zu.height = Math.min(c.height, y1 + rand + 1) - y;
			zu.getContext("2d")?.drawImage(c, x, y, zu.width, zu.height, 0, 0, zu.width, zu.height);
			fertig(zu.toDataURL("image/png"));
		};
		bild.onerror = () => fertig("");
		bild.src = dataUrl;
	});
}
/** Stand vom Server übernehmen; die Unterschrift nur bei Änderung neu färben. */
async function arztUebernehmen(roh) {
	if (!roh || typeof roh.name !== "string" || typeof localStorage === "undefined") return;
	const original = typeof roh.signatur === "string" && roh.signatur.startsWith("data:image/") ? roh.signatur : "";
	const alt = arztLesen();
	const quelle = kennung(original);
	if (alt && alt.name === roh.name && alt.quelle === quelle) return;
	const neu = {
		name: roh.name,
		signatur: alt?.quelle === quelle ? alt.signatur : await blauFaerben(original),
		quelle
	};
	try {
		localStorage.setItem(ARZT_KEY, JSON.stringify(neu));
	} catch {
		return;
	}
	if (typeof window !== "undefined") window.dispatchEvent(new Event(ARZT_EREIGNIS));
}
//#endregion
//#region src/ablage.ts
/**
* Ablage gespeicherter Pläne mit Freigabe-Status (im Browser, localStorage).
* Die Form der Einträge entspricht dem späteren MAS-Register, damit die Ablage
* für die Clara-Anbindung umziehen kann, ohne dass sich die Oberfläche ändert.
*/
/** Lauf 1 ist A001, 934 ist A934, 1000 ist B001. Clara-Nummern wie C002 bleiben unverändert. */
function planNummer(praefix, lauf, jahr = (/* @__PURE__ */ new Date()).getFullYear()) {
	const n = Math.max(1, Math.floor(lauf) || 1);
	const reihe = Math.floor((n - 1) / 999);
	const ziffer = String((n - 1) % 999 + 1).padStart(3, "0");
	return `${praefix}-${jahr}-${String.fromCharCode(65 + reihe % 26)}${ziffer}`;
}
/** PlanR-Übersicht; die Sitzung (Cookie) gilt für denselben Host, daher nicht fest 127.0.0.1 */
var hubAdresse = () => typeof location === "undefined" ? "http://127.0.0.1:5189/api/plaene" : location.pathname.startsWith("/planer/") ? `${location.origin}/api/plaene` : location.hostname.endsWith(".pickadoc-tunnel.com") ? "https://planr.pickadoc-tunnel.com/api/plaene" : `http://${location.hostname}:5189/api/plaene`;
/** Praxiskopf vom Server holen; beim ersten neuen Stand einmal neu laden, damit die Planer-Einstellungen ihn übernehmen. */
function praxisAbgleichen() {
	if (typeof fetch !== "function" || typeof localStorage === "undefined" || typeof location === "undefined") return;
	fetch(hubAdresse().replace(/\/plaene$/, "/praxisdaten"), {
		cache: "no-store",
		credentials: "include"
	}).then((r) => r.ok ? r.json() : null).then((d) => {
		arztUebernehmen(d?.arzt);
		if (!d?.praxis || !Object.keys(d.praxis).length) return;
		const neu = JSON.stringify(d.praxis);
		if (localStorage.getItem("planr.praxis.zentral.v1") === neu) return;
		localStorage.setItem(ZENTRALE_PRAXIS_KEY, neu);
		if (sessionStorage.getItem("planr.praxis.zentral.v1")) return;
		sessionStorage.setItem(ZENTRALE_PRAXIS_KEY, "1");
		location.reload();
	}).catch(() => {});
}
praxisAbgleichen();
typeof location === "undefined" || (new URLSearchParams(location.search).get("plan") ?? "").trim().slice(0, 80);
//#endregion
//#region src/planNeu.ts
var heute = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
var STANDARD_EINSTELLUNGEN = {
	praxis: standardPraxis(),
	gozFaktor: 2.3,
	mwst: 7,
	gueltigMonate: 6,
	naechsteNummer: 1,
	eigenlabor: []
};
var STANDARD_REGLER = {
	gozStufe: 0,
	gozFaktor: 0,
	laborStufe: 0,
	laborAufschlag: 0,
	aus: []
};
function neuerPlan(nummer) {
	return {
		nummer: planNummer("KV", nummer),
		datum: heute(),
		patient: leererPatient(),
		zaehne: {},
		abformung: "",
		abformungProthese: "",
		implantat: STANDARD_IMPLANTAT,
		manuell: [],
		anpassungen: {},
		entfernt: [],
		regler: STANDARD_REGLER,
		bemerkung: ""
	};
}
//#endregion
//#region src/clara/index.ts
/**
* Einstieg für MAS/Clara: privater Zahnersatz per Sprache. Auftrag, Befund und Rückfragen versteht die
* HKP-Engine (gleiche Kürzel), gerechnet wird mit der Engine dieses Planers. `npm run build:engine` baut
* daraus MAS-2/backend/src/vendor/privat-ze-engine.mjs.
*/
var ENGINE_STAND = "2026-11-09 20:23";
var AUS_DEM_AUFTRAG = /angenommen|cover-denture|passt nicht|all-on|druckknopf|kugelkopf|implantatsteg|galvano|tabletop|inlay|onlay|abutment|verschraub|zementier/i;
var NUR_KASSE = /bonus|festzuschuss|härtefall|kasse|bema|richtlinie|hkp/i;
var sortiert = (zs) => [...zs].sort((a, b) => ALLE_ZAEHNE$1.indexOf(a) - ALLE_ZAEHNE$1.indexOf(b));
/** Zahnschema des HKP-Entwurfs; ohne eigene Planung gilt dort die Regelversorgung (Zeile R) */
function zaehneAus(hkp) {
	const ohneTp = Object.values(hkp).every((z) => !z.TP?.trim());
	const zaehne = {};
	for (const [nr, z] of Object.entries(hkp)) {
		const B = (z.B ?? "").trim();
		const TP = ((ohneTp ? z.R : z.TP) ?? "").trim().toUpperCase();
		if (!B && !TP) continue;
		zaehne[nr] = {
			B,
			TP,
			...!ohneTp && z.bAnfang ? { bAnfang: true } : {},
			...!ohneTp && z.bEnde ? { bEnde: true } : {}
		};
	}
	return zaehne;
}
function zusammenfassen(plan, k) {
	const mit = (re) => sortiert(Object.entries(plan.zaehne).filter(([, z]) => re.test(z.TP)).map(([n]) => n));
	return {
		kronen: mit(/^(K|KV|KH|KVH|KM|KMH|PK|PKM|PKV|ZA|VE|VEK|I[1-4]|C[1-4]|ONK?)$/),
		glieder: mit(/^(B|BV|BM|SB|SBV|SBM|ZAB)$/),
		ersetzt: mit(/^(E|B|BV|BM)$/),
		teleskope: mit(/^S?T(?:2|Z)?[VM]?$/),
		implantatkronen: mit(/^(SK|ZAS)/),
		verbindung: mit(/^SO$/),
		steg: mit(/^SEO$/),
		...plan.ankerGesagt ? { ankerGesagt: plan.ankerGesagt } : {},
		...plan.haltung ? { haltung: plan.haltung } : {},
		...plan.kronenArt ? { kronenArt: plan.kronenArt } : {},
		...plan.abutmentWort ? { abutmentWort: plan.abutmentWort } : {},
		honorar: k.summeHonorar,
		labor: Math.round((k.summeLaborNetto + k.mwst) * 100) / 100,
		material: k.summeMaterial,
		gesamt: k.gesamt
	};
}
/** Gesprochener Auftrag + Befund → gerechneter privater Kostenvoranschlag (ohne Nummer) oder Rückfrage */
function privatZeEntwurf(auftragText, befund, optionen = {}) {
	const r = planAusAuftrag(auftragVerstehen(auftragText), befund, { implantatSystem: optionen.implantatSystem });
	if (r.status !== "ok") return r;
	const plan = {
		...neuerPlan(1),
		nummer: "",
		patient: {
			...neuerPlan(1).patient,
			...optionen.patient
		},
		zaehne: zaehneAus(r.plan.zaehne),
		abformung: r.plan.abformung,
		abformungProthese: r.plan.abformungProthese,
		werkstoffe: { ...r.plan.werkstoffe }
	};
	if (r.plan.implantat) plan.implantat = {
		...plan.implantat,
		...r.plan.implantat.system ? { system: r.plan.implantat.system } : {},
		...r.plan.implantat.abutment ? { abutment: r.plan.implantat.abutment } : {},
		...r.plan.implantat.abformung === "offen" || r.plan.implantat.abformung === "geschlossen" ? { loeffel: r.plan.implantat.abformung } : {}
	};
	if (r.plan.einstellungen.ankerGesagt) plan.ankerGesagt = r.plan.einstellungen.ankerGesagt;
	if (r.plan.einstellungen.haltung) plan.haltung = r.plan.einstellungen.haltung;
	if (r.plan.einstellungen.kronenArt) plan.kronenArt = r.plan.einstellungen.kronenArt;
	if (r.plan.einstellungen.abutmentWort) plan.abutmentWort = r.plan.einstellungen.abutmentWort;
	const kalkulation = kalkulieren(plan, {
		...STANDARD_EINSTELLUNGEN,
		...optionen.einstellungen
	});
	const hinweise = r.hinweise.filter((h) => AUS_DEM_AUFTRAG.test(h) && !NUR_KASSE.test(h));
	return {
		status: "ok",
		plan,
		kalkulation,
		zusammenfassung: zusammenfassen(plan, kalkulation),
		hinweise: [...hinweise, ...kalkulation.hinweise]
	};
}
//#endregion
export { ENGINE_STAND, privatZeEntwurf, zusammenfassen };
