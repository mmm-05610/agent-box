/** One-flight-at-a-time promise gate. */

export function singleFlight<T>(ref: { current: null | Promise<T> }, start: () => Promise<T> | T): Promise<T> {
  if (ref.current) {
    return ref.current
  }

  let flight: Promise<T>

  try {
    flight = Promise.resolve(start())
  } catch (err) {
    flight = Promise.reject(err)
  }

  ref.current = flight
  flight.catch(() => {
    if (ref.current === flight) {
      ref.current = null
    }
  })

  return flight
}

