/**
 * This is to test the performance of parsing and comparing UUIDs.
 *
 * There are five methods of comparing UUIDs:
 * 1) String.replaceAll("-", "") == Binary.toString("hex")
 * 2) String == Binary.toUUID().toHexString()
 * 3) new UUID(String).toBinary().value() == Binary.value()
 * 4) new UUID(String).equals(Binary.toUUID())
 * 5) Binary.toUUID().equals(String)
 *
 * The need for this test stems from the fact that users provide UUID values in
 * string form, and those values are stored in Binary form (compressed).
 *
 * In order to return usable data, this Binary form must be converted into its
 * hexadecimal string equivalent. To compare provided String UUIDs to the
 * stored Binary format, some conversion must be done. These tests are made to
 * discover the fastest way to do these comparisons.
 */

const { UUID } = require('bson')
//                          xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
const NULL_UUID = new UUID(Buffer.alloc(16, 0)).toBinary()

async function main() {

    const SIZE = 5_000_000

    console.log('Generating UUIDs for the test')
    let uuids = []
    for (let i = SIZE; i > 0; i--) {
        uuids.push(new UUID().toBinary())
    }
    console.log('UUID binaries generated. Sample: ')
    for (let i = 4; i >= 0; i--) {
        console.log(`    ${uuids[i].toUUID().toHexString()}`)
    }

    // Pull out first UUID to be our "search"
    let search = new UUID(uuids[0].toUUID()).toHexString(true)
    let results = []
    let start, end, r;


    // String.replaceAll("-", "") == Binary.toString("hex")
    console.log('Testing String.replaceAll("-", "") == Binary.toString("hex")')
    start = Date.now()
    r = false
    for (let i = SIZE - 1; i >= 0; i--) {
        search = new UUID(uuids[i].toUUID()).toHexString(true)
        let a = search.replaceAll("-", "")
        let b = uuids[i].toString("hex")
        r = a == b //|| r
        if (!r) break
    }
    end = Date.now()
    // confirm that 1 match was found
    if (!r) {
        console.error('Test failed to match!')
        return
    }
    results.push(
        ['String.replaceAll == Binary.toString', end - start]
    )


    // String == Binary.toUUID().toHexString()
    console.log('Testing String == Binary.toUUID().toHexString()')
    start = Date.now()
    r = false
    for (let i = SIZE - 1; i >= 0; i--) {
        search = new UUID(uuids[i].toUUID()).toHexString(true)
        let a = search
        let b = uuids[i].toUUID().toHexString()
        r = a == b //|| r
        if (!r) break
    }
    end = Date.now()
    // confirm that 1 match was found
    if (!r) {
        console.error('Test failed to match!')
        return
    }
    results.push(
        ['String == Binary.toUUID.toHexString', end - start]
    )


    // new UUID(String).toBinary().value() == Binary.value()
    console.log('Testing new UUID(String).toBinary().value() == Binary.value()')
    start = Date.now()
    r = false
    for (let i = SIZE - 1; i >= 0; i--) {
        search = new UUID(uuids[i].toUUID()).toHexString(true)
        let a = new UUID(search).toBinary().value()
        let b = uuids[i].value()
        r = a == b //|| r
        if (!r) break
    }
    end = Date.now()
    // confirm that 1 match was found
    if (!r) {
        console.error('Test failed to match!')
        return
    }
    results.push(
        ['UUID(String).toBinary.value == Binary.value', end - start]
    )


    // new UUID(String).equals(Binary.toUUID())
    console.log('Testing new UUID(String).equals(Binary.toUUID())')
    start = Date.now()
    r = false
    for (let i = SIZE - 1; i >= 0; i--) {
        search = new UUID(uuids[i].toUUID()).toHexString(true)
        let a = new UUID(search)
        let b = uuids[i].toUUID()
        r = a.equals(b) //|| r
        if (!r) break
    }
    end = Date.now()
    // confirm that 1 match was found
    if (!r) {
        console.error('Test failed to match!')
        return
    }
    results.push(
        ['UUID(String).equals(Binary.toUUID)', end - start]
    )


    // Binary.toUUID().equals(String)
    console.log('Testing Binary.toUUID().equals(String)')
    start = Date.now()
    r = false
    for (let i = SIZE - 1; i >= 0; i--) {
        search = new UUID(uuids[i].toUUID()).toHexString(true)
        let a = search
        let b = uuids[i].toUUID()
        r = b.equals(a) //|| r
        if (!r) break
    }
    end = Date.now()
    // confirm that 1 match was found
    if (!r) {
        console.error('Test failed to match!')
        return
    }
    results.push(
        ['Binary.toUUID.equals(String)', end - start]
    )


    // Custom comparison tool
    console.log('Testing custom comparison')
    var hexSliceLookupTable = (function () {
        var alphabet = '0123456789abcdef'
        var table = new Array(256)
        for (var i = 0; i < 16; ++i) {
            var i16 = i * 16
            for (var j = 0; j < 16; ++j) {
                table[i16 + j] = alphabet[i] + alphabet[j]
            }
        }
        return table
    })()
    function compareUUID(string, binary) {
        let i = 0
        for (let int of binary.buffer) {
            if (string[i] == '-')
                i++
            if (string.substring(i++, ++i) != hexSliceLookupTable[int])
                return false
        }
        return true
    }
    start = Date.now()
    r = false
    for (let i = SIZE - 1; i >= 0; i--) {
        search = new UUID(uuids[i].toUUID()).toHexString(true)
        let a = search
        let b = uuids[i]
        r = compareUUID(a, b) //|| r
        if (!r) break
    }
    end = Date.now()
    // confirm that 1 match was found
    if (!r) {
        console.error('Test failed to match!')
        return
    }
    results.push(
        ['Custom', end - start]
    )


    console.log('Tests complete.')
    for (let r of results) {
        console.log(`${r[1]} ms => ${r[0]}`)
    }

    console.log('Cleaning up')
    results.splice(0, results.length)
    uuids.splice(0, SIZE)
}

// Run 5 tests
for (let t = 1; t <= 5; t++) {
    console.log("Test #" + t)
    main()
        .then(console.log)
        .catch(console.error)
    console.log("\n\n")
}
