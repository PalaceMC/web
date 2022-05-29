
/**
 * Recursively flattens the object and returns a new object.
 *
 * @example <caption>Returns `{"in.depth": 50}`</caption>
 * let obj = { in: { depth: 50 } }
 * console.log(flattenObject(obj))
 *
 * @param {object} object object to flatten
 * @returns {object} new flattened object
 */
function flattenObject(object) {
    return _flattenObject(object, null, {})
}

function _flattenObject(object, parent, result) {
    for (const key of Object.keys(object)) {
        const propName = parent ? parent + '.' + key : key;
        if (typeof object[key] === 'object') {
            _flattenObject(object[key], propName, result);
        } else {
            result[propName] = object[key];
        }
    }
    return result;
}

/**
 * Map with a limited size. As new entries are added, the oldest ones are
 * removed. To retain older entries, they must be re-added. The size of the
 * map will never exceed the `maxSize`, provided that calls to `set()` are
 * always called by the same thread.
 */
class LimitedMap {

    #map = new Map();
    #maxSize;

    constructor(maxSize) {
        if (typeof maxSize != 'number')
            maxSize = 0;
        this.#maxSize = Math.round(maxSize);
    }

    clear() {
        this.#map.clear();
    }

    delete(key) {
        return this.#map.delete(key);
    }

    *entries() {
        for (const [key, value] of this.#map)
            yield [key, value[0]]
    }

    forEach(callbackfn) {
        return this.forEach(callbackfn, undefined);
    }

    forEach(callbackfn, thisArg) {
        if (typeof callbackfn != 'function')
            throw new TypeError(`${typeof callbackfn} is not a function`);
        return this.#map.forEach((value, key) => {
            callbackfn.apply(thisArg, [key, value]);
        })
    }

    get(key) {
        let val = this.#map.get(key);
        if (val == undefined)
            return undefined;
        else
            return val[0];
    }

    has(key) {
        return this.#map.has(key);
    }

    keys() {
        return this.#map.keys();
    }

    set(key, value) {
        this.#map.set(key, [value, process.hrtime.bigint()]); // hrtime is the only one precise enough

        // remove oldest if over limit
        if (this.#map.size > this.#maxSize) {
            let oldest = null
            for (const [k, v] of this.#map) {
                if (oldest == null || v[1] < oldest[1]) {
                    oldest = [k, v[1]];
                }
            }
            // map is at least size 1, so oldest will always be set
            this.#map.delete(oldest[0]);
        }

        return this;
    }

    *values() {
        for (const v of this.#map.values())
            yield v[0];
    }

}

/**
 * Retrieve nested value from object using flat dot notation string. If any
 * nested path does not exist, the result is `undefined`
 *
 * From: https://stackoverflow.com/a/22129960/4561008
 *
 * @param {object} object object to get value from
 * @param {string|string[]} path path, can be an array for names that include dots
 */
function resolveObjectPath(object, path) {
    var properties = Array.isArray(path) ? path : path.split('.')
    return properties.reduce((prev, curr) => prev?.[curr], object)
}

/**
 * Sleeps for milliseconds
 * @param {number} milliseconds
 */
async function sleep(milliseconds) {
    await new Promise(r => setTimeout(r, milliseconds))
}

module.exports = {
    flattenObject,
    LimitedMap,
    resolveObjectPath,
    sleep,
}
