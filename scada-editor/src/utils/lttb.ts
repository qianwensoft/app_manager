/**
 * LTTB downsampling for typed time series data.
 * @param times     Float64Array of Unix-ms timestamps (chronological)
 * @param values    Float64Array of corresponding values
 * @param threshold target number of output points (min 3)
 * @returns { times: Float64Array, values: Float64Array }
 */
export function lttb(
  times: Float64Array,
  values: Float64Array,
  threshold: number
): { times: Float64Array; values: Float64Array } {
  const len = times.length
  if (threshold < 3) threshold = 3
  if (len <= threshold) {
    return { times: times.slice(), values: values.slice() }
  }

  const outT = new Float64Array(threshold)
  const outV = new Float64Array(threshold)

  // Always include first point
  outT[0] = times[0]
  outV[0] = values[0]

  const bucketSize = (len - 2) / (threshold - 2)
  let prevIdx = 0

  for (let i = 0; i < threshold - 2; i++) {
    // Current bucket range
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, len - 1)

    // Average of next bucket (used as third triangle point)
    const nextBucketStart = bucketEnd
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, len - 1)
    let avgT = 0
    let avgV = 0
    const nextLen = nextBucketEnd - nextBucketStart
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgT += times[j]
      avgV += values[j]
    }
    if (nextLen > 0) {
      avgT /= nextLen
      avgV /= nextLen
    } else {
      avgT = times[len - 1]
      avgV = values[len - 1]
    }

    // Pick point in current bucket with largest triangle area
    const aT = outT[i]
    const aV = outV[i]
    let maxArea = -1
    let maxIdx = bucketStart
    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (aT - avgT) * (values[j] - aV) - (aT - times[j]) * (avgV - aV)
      )
      if (area > maxArea) {
        maxArea = area
        maxIdx = j
      }
    }

    outT[i + 1] = times[maxIdx]
    outV[i + 1] = values[maxIdx]
    prevIdx = maxIdx
  }

  // Always include last point
  outT[threshold - 1] = times[len - 1]
  outV[threshold - 1] = values[len - 1]

  return { times: outT, values: outV }
}
