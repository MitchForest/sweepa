/**
 * Test fixture for Sweepa detectors
 */

// --- UNUSED EXPORTS ---

// This function is exported but never imported
export function unusedExportedFunction() {
  return 'never used'
}

// This is used
export function usedFunction() {
  return 'used'
}

// --- UNUSED PARAMETERS ---

// Parameter 'unused' is never used
export function hasUnusedParam(used: string, unused: number) {
  return used.toUpperCase()
}

// All parameters used
export function allParamsUsed(a: string, b: number) {
  return a + b.toString()
}

// Arrow function with unused param
export const arrowWithUnused = (name: string, unused: boolean) => {
  return `Hello ${name}`
}

// Destructuring with unused
export function destructuringUnused({ a, b }: { a: string; b: string }) {
  return a // b is unused
}

// --- UNUSED METHODS ---

export class ServiceClass {
  // This method is never called
  unusedMethod() {
    return 'never called'
  }

  // This method is called
  usedMethod() {
    return 'called'
  }

  // Private method that's unused
  private unusedPrivateMethod() {
    return 'never called'
  }

  callUsedMethod() {
    return this.usedMethod()
  }
}

// --- ASSIGN-ONLY PROPERTIES ---

export class TrackingClass {
  // This property is written but never read
  private lastUpdated: Date = new Date()

  // This property is both read and written
  private counter: number = 0

  update() {
    this.lastUpdated = new Date() // Write only
    this.counter++
  }

  getCount() {
    return this.counter // Read
  }
}

// --- USAGE (to create references) ---

const service = new ServiceClass()
service.callUsedMethod()

const tracker = new TrackingClass()
tracker.update()
console.log(tracker.getCount())

hasUnusedParam('hello', 42)
allParamsUsed('a', 1)
arrowWithUnused('world', true)
destructuringUnused({ a: 'x', b: 'y' })

console.log(usedFunction())
