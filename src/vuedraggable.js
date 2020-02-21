import Sortable from "sortablejs";
import { Swap } from 'sortablejs/modular/sortable.core.esm';
Sortable.mount(new Swap())

import { insertNodeAt, camelize, console, removeNode } from "./util/helper";

function buildAttribute(object, propName, value) {
  if (value === undefined) {
    return object;
  }
  object = object || {};
  object[propName] = value;
  return object;
}

function computeVmIndex(vnodes, element) {
  console.log('computeVmIndex')
  return vnodes.map(elt => elt.elm).indexOf(element);
}

function computeIndexes(slots, children, isTransition, footerOffset) {
  console.log('computeIndexes')
  if (!slots) {
    return [];
  }

  const elmFromNodes = slots.map(elt => elt.elm);
  const footerIndex = children.length - footerOffset;
  const rawIndexes = [...children].map((elt, idx) =>
    idx >= footerIndex ? elmFromNodes.length : elmFromNodes.indexOf(elt)
  );
  return isTransition ? rawIndexes.filter(ind => ind !== -1) : rawIndexes;
}

function emit(evtName, evtData) {
  // console.log('emit', evtName, evtData)
  this.$nextTick(() => this.$emit(evtName.toLowerCase(), evtData));
}

function delegateAndEmit(evtName) {
  console.log('delegateAndEmit')
  return evtData => {
    if (this.realList !== null) {
      this["onDrag" + evtName](evtData);
    }
    emit.call(this, evtName, evtData);
  };
}

function isTransitionName(name) {
  return ["transition-group", "TransitionGroup"].includes(name);
}

function isTransition(slots) {
  if (!slots || slots.length !== 1) {
    return false;
  }
  const [{ componentOptions }] = slots;
  if (!componentOptions) {
    return false;
  }
  return isTransitionName(componentOptions.tag);
}

function getSlot(slot, scopedSlot, key) {
  return slot[key] || (scopedSlot[key] ? scopedSlot[key]() : undefined);
}

function computeChildrenAndOffsets(children, slot, scopedSlot) {
  let headerOffset = 0;
  let footerOffset = 0;
  const header = getSlot(slot, scopedSlot, "header");
  if (header) {
    headerOffset = header.length;
    children = children ? [...header, ...children] : [...header];
  }
  const footer = getSlot(slot, scopedSlot, "footer");
  if (footer) {
    footerOffset = footer.length;
    children = children ? [...children, ...footer] : [...footer];
  }
  return { children, headerOffset, footerOffset };
}

function getComponentAttributes($attrs, componentData) {
  let attributes = null;
  const update = (name, value) => {
    attributes = buildAttribute(attributes, name, value);
  };
  const attrs = Object.keys($attrs)
    .filter(key => key === "id" || key.startsWith("data-"))
    .reduce((res, key) => {
      res[key] = $attrs[key];
      return res;
    }, {});
  update("attrs", attrs);

  if (!componentData) {
    return attributes;
  }
  const { on, props, attrs: componentDataAttrs } = componentData;
  update("on", on);
  update("props", props);
  Object.assign(attributes.attrs, componentDataAttrs);
  return attributes;
}

const eventsListened = ["Start", "Add", "Remove", "Update", "End"];
const eventsToEmit = ["Choose", "Unchoose", "Sort", "Filter", "Clone"];
const readonlyProperties = ["Move", ...eventsListened, ...eventsToEmit].map(
  evt => "on" + evt
);
var draggingElement = null;

const props = {
  options: Object,
  list: {
    type: Array,
    required: false,
    default: null
  },
  value: {
    type: Array,
    required: false,
    default: null
  },
  noTransitionOnDrag: {
    type: Boolean,
    default: false
  },
  clone: {
    type: Function,
    default: original => {
      return original;
    }
  },
  element: {
    type: String,
    default: "div"
  },
  tag: {
    type: String,
    default: null
  },
  move: {
    type: Function,
    default: null
  },
  componentData: {
    type: Object,
    required: false,
    default: null
  },
  swap: {
    type: Boolean,
    default: false
  }
};

const draggableComponent = {
  name: "draggable",

  inheritAttrs: false,

  props,

  data() {
    return {
      transitionMode: false,
      noneFunctionalComponentMode: false
    };
  },

  render(h) {
    const slots = this.$slots.default;
    this.transitionMode = isTransition(slots);
    const { children, headerOffset, footerOffset } = computeChildrenAndOffsets(
      slots,
      this.$slots,
      this.$scopedSlots
    );
    this.headerOffset = headerOffset;
    this.footerOffset = footerOffset;
    const attributes = getComponentAttributes(this.$attrs, this.componentData);
    return h(this.getTag(), attributes, children);
  },

  created() {
    if (this.list !== null && this.value !== null) {
      console.error(
        "Value and list props are mutually exclusive! Please set one or another."
      );
    }

    if (this.element !== "div") {
      console.warn(
        "Element props is deprecated please use tag props instead. See https://github.com/SortableJS/Vue.Draggable/blob/master/documentation/migrate.md#element-props"
      );
    }

    if (this.options !== undefined) {
      console.warn(
        "Options props is deprecated, add sortable options directly as vue.draggable item, or use v-bind. See https://github.com/SortableJS/Vue.Draggable/blob/master/documentation/migrate.md#options-props"
      );
    }
  },

  mounted() {
    this.noneFunctionalComponentMode =
      this.getTag().toLowerCase() !== this.$el.nodeName.toLowerCase() &&
      !this.getIsFunctional();
    if (this.noneFunctionalComponentMode && this.transitionMode) {
      throw new Error(
        `Transition-group inside component is not supported. Please alter tag value or remove transition-group. Current tag value: ${this.getTag()}`
      );
    }
    const optionsAdded = {};
    eventsListened.forEach(elt => {
      optionsAdded["on" + elt] = delegateAndEmit.call(this, elt);
    });

    eventsToEmit.forEach(elt => {
      optionsAdded["on" + elt] = emit.bind(this, elt);
    });

    const attributes = Object.keys(this.$attrs).reduce((res, key) => {
      res[camelize(key)] = this.$attrs[key];
      return res;
    }, {});

    const options = Object.assign({}, this.options, attributes, optionsAdded, {
      onMove: (evt, originalEvent) => {
        return this.onDragMove(evt, originalEvent);
      }
    });
    !("draggable" in options) && (options.draggable = ">*");
    this._sortable = new Sortable(this.rootContainer, options);
    this.computeIndexes();
  },

  beforeDestroy() {
    if (this._sortable !== undefined) this._sortable.destroy();
  },

  computed: {
    rootContainer() {
      return this.transitionMode ? this.$el.children[0] : this.$el;
    },

    realList() {
      return this.list ? this.list : this.value;
    }
  },

  watch: {
    options: {
      handler(newOptionValue) {
        console.log('options')
        this.updateOptions(newOptionValue);
      },
      deep: true
    },

    $attrs: {
      handler(newOptionValue) {
        console.log('$attrs')
        this.updateOptions(newOptionValue);
      },
      deep: true
    },

    realList() {
      console.log('realList')
      // this.computeIndexes();
    }
  },

  methods: {
    getIsFunctional() {
      const { fnOptions } = this._vnode;
      return fnOptions && fnOptions.functional;
    },

    getTag() {
      return this.tag || this.element;
    },

    updateOptions(newOptionValue) {
      for (var property in newOptionValue) {
        const value = camelize(property);
        if (readonlyProperties.indexOf(value) === -1) {
          this._sortable.option(value, newOptionValue[property]);
        }
      }
    },

    getChildrenNodes() {
      if (this.noneFunctionalComponentMode) {
        return this.$children[0].$slots.default;
      }
      const rawNodes = this.$slots.default;
      return this.transitionMode ? rawNodes[0].child.$slots.default : rawNodes;
    },

    computeIndexes() {
      this.$nextTick(() => {
        this.visibleIndexes = computeIndexes(
          this.getChildrenNodes(),
          this.rootContainer.children,
          this.transitionMode,
          this.footerOffset
        );
      });
    },

    getUnderlyingVm(htmlElt) {
      const index = computeVmIndex(this.getChildrenNodes() || [], htmlElt);
      if (index === -1) {
        //Edge case during move callback: related element might be
        //an element different from collection
        return null;
      }
      const element = this.realList[index];
      return { index, element };
    },

    getUnderlyingPotencialDraggableComponent({ __vue__: vue }) {
      if (
        !vue ||
        !vue.$options ||
        !isTransitionName(vue.$options._componentTag)
      ) {
        if (
          !("realList" in vue) &&
          vue.$children.length === 1 &&
          "realList" in vue.$children[0]
        )
          return vue.$children[0];

        return vue;
      }
      return vue.$parent;
    },

    emitChanges(evt) {
      this.$nextTick(() => {
        this.$emit("change", evt);
      });
    },

    alterList(onList) {
      if (this.list) {
        onList(this.list);
        return;
      }
      const newList = [...this.value];
      onList(newList);
      this.$emit("input", newList);
    },

    spliceList() {
      const spliceList = list => list.splice(...arguments);
      this.alterList(spliceList);
    },

    updatePosition(oldIndex, newIndex) {
      const updatePosition = list =>
        list.splice(newIndex, 0, list.splice(oldIndex, 1)[0]);
      this.alterList(updatePosition);
    },

    swapPosition (oldIndex, newIndex) {
      // console.log(JSON.stringify(this.list))
      const swapPosition = list =>
        list[oldIndex] = list.splice(newIndex, 1, list[oldIndex])[0];
      this.alterList(swapPosition);
    },
    getRelatedContextFromMoveEvent({ to, related }) {
      const component = this.getUnderlyingPotencialDraggableComponent(to);
      if (!component) {
        return { component };
      }
      const list = component.realList;
      const context = { list, component };
      if (to !== related && list && component.getUnderlyingVm) {
        const destination = component.getUnderlyingVm(related);
        if (destination) {
          return Object.assign(destination, context);
        }
      }
      return context;
    },

    getVmIndex(domIndex) {
      const indexes = this.visibleIndexes;
      const numberIndexes = indexes.length;
      return domIndex > numberIndexes - 1 ? numberIndexes : indexes[domIndex];
    },

    getComponent() {
      return this.$slots.default[0].componentInstance;
    },

    resetTransitionData(index) {
      if (!this.noTransitionOnDrag || !this.transitionMode) {
        return;
      }
      var nodes = this.getChildrenNodes();
      nodes[index].data = null;
      const transitionContainer = this.getComponent();
      transitionContainer.children = [];
      transitionContainer.kept = undefined;
    },

    onDragStart(evt) {
      console.log('onDragStart')
      // console.log(evt)
      this.context = this.getUnderlyingVm(evt.item);
      evt.item._underlying_vm_ = this.clone(this.context.element);
      draggingElement = evt.item;
    },
    onDragAdd(evt) {
      console.log('onDragAdd')
      // console.log(evt)
    
      if (this.swap) {

        // debugger
        
        // let oldItem = this.list[evt.newIndex]

        const lastswapContext = this.getUnderlyingVm(evt.swapItem)
        evt.swapItem._underlying_vm_ = this.clone(lastswapContext.element)
        this.spliceList(evt.newIndex, 1, evt.item._underlying_vm_)
        this.computeIndexes()

        // const targetContext = this.getUnderlyingVm(evt.item)
        // if (!targetContext) {
        //   return;
        // }
        
        // evt.item._underlying_vm_ = this.clone(targetContext.element);       
        // const element = targetContext.element 
        // if (element === undefined) {
        //   return;
        // }
        // const swapContext = this.getUnderlyingVm(evt.swapItem)
        // if (!swapContext) {
        //   return;
        // }

        // evt.swapItem._underlying_vm_ = this.clone(swapContext.element);        
        // const swapElement = swapContext.element

        // if (swapElement === undefined) {
        //   return;
        // }

        // debugger

        // const newIndex = this.getVmIndex(evt.newIndex);

        // // let item = evt.item.cloneNode(true);
        // // removeNode(evt.item);
        // // insertNodeAt(evt.to, item, newIndex);

        // const toComponent = this.getUnderlyingPotencialDraggableComponent(evt.to)
        // toComponent.spliceList(newIndex, 1, element)

        // toComponent.computeIndexes();

        // const oldIndex = this.getVmIndex(evt.oldIndex);

        // // let swapItem = evt.swapItem.cloneNode(true);
        // // removeNode(evt.swapItem);
        // // insertNodeAt(evt.from, swapItem, oldIndex);

        // const fromComponent = this.getUnderlyingPotencialDraggableComponent(evt.from)
        // fromComponent.spliceList(oldIndex, 1, swapElement)

        // fromComponent.computeIndexes();

      } else {
        const element = evt.item._underlying_vm_;
        if (element === undefined) {
          return;
        }
        removeNode(evt.item);
        const newIndex = this.getVmIndex(evt.newIndex);
        this.spliceList(newIndex, 0, element);
        this.computeIndexes();
        const added = { element, newIndex };
        this.emitChanges({ added });
      }
    },

    onDragRemove(evt) {
      console.log('onDragRemove')
      // console.log(evt)
      if (this.swap) {
        debugger
        this.spliceList(evt.oldIndex, 1, evt.swapItem._underlying_vm_)
        this.computeIndexes()
      } else {
        insertNodeAt(this.rootContainer, evt.item, evt.oldIndex);
        if (evt.pullMode === "clone") {
          removeNode(evt.clone);
          return;
        }
        const oldIndex = this.context.index;
        this.spliceList(oldIndex, 1);
        const removed = { element: this.context.element, oldIndex };
        this.resetTransitionData(oldIndex);
        this.emitChanges({ removed });
      }
    },

    onDragUpdate(evt) {
      console.log('onDragUpdate')
      // console.log(evt)

      if (this.swap) {
        const oldIndex = this.context.index;
        const newIndex = this.getVmIndex(evt.newIndex);
        console.log(oldIndex, newIndex)
        evt.from.replaceChild(evt.swapItem, evt.item)
        insertNodeAt(evt.from, evt.item, oldIndex)
        this.swapPosition(oldIndex, newIndex);
        const swaped = { element: this.context.element, oldIndex, newIndex };
        this.emitChanges({ swaped });
      } else {
        removeNode(evt.item);
        insertNodeAt(evt.from, evt.item, evt.oldIndex);
        const oldIndex = this.context.index;
        const newIndex = this.getVmIndex(evt.newIndex);
        this.updatePosition(oldIndex, newIndex);
        const moved = { element: this.context.element, oldIndex, newIndex };
        this.emitChanges({ moved });
      }

    },

    updateProperty(evt, propertyName) {
      evt.hasOwnProperty(propertyName) &&
        (evt[propertyName] += this.headerOffset);
    },

    computeFutureIndex(relatedContext, evt) {
      if (!relatedContext.element) {
        return 0;
      }
      const domChildren = [...evt.to.children].filter(
        el => el.style["display"] !== "none"
      );
      const currentDOMIndex = domChildren.indexOf(evt.related);
      const currentIndex = relatedContext.component.getVmIndex(currentDOMIndex);
      const draggedInList = domChildren.indexOf(draggingElement) !== -1;
      return draggedInList || !evt.willInsertAfter
        ? currentIndex
        : currentIndex + 1;
    },

    onDragMove(evt, originalEvent) {
      console.log('onDragMove')
      const onMove = this.move;
      if (!onMove || !this.realList) {
        return true;
      }

      const relatedContext = this.getRelatedContextFromMoveEvent(evt);
      const draggedContext = this.context;
      const futureIndex = this.computeFutureIndex(relatedContext, evt);
      Object.assign(draggedContext, { futureIndex });
      const sendEvt = Object.assign({}, evt, {
        relatedContext,
        draggedContext
      });

      return onMove(sendEvt, originalEvent);
    },

    onDragEnd(evt) {
      console.log('onDragEnd')

      // if (this.swap) {
      //    let context = this.getRelatedContextFromMoveEvent(evt)
      //    evt.swapItem._underlying_vm_ = this.clone(context.element)
      //    console.log(evt.swapItem)
      // }

      this.computeIndexes();
      draggingElement = null;
    }
  }
};

if (typeof window !== "undefined" && "Vue" in window) {
  window.Vue.component("draggable", draggableComponent);
}

export default draggableComponent;
