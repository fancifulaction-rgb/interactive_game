/**
 * Демонстрация deadlock без reentrant critical и успех с reentrant.
 * node scripts/test-critical-reentrant.mjs
 */

function makeQueue({ reentrant }) {
  let criticalRunning = 0
  let criticalDepth = 0
  const queue = []

  function drain() {
    if (criticalRunning >= 1 || queue.length === 0) return
    const item = queue.shift()
    criticalRunning++
    criticalDepth++
    Promise.resolve()
      .then(() => item.task())
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        criticalDepth--
        criticalRunning--
        drain()
      })
  }

  function enqueueCritical(task) {
    if (reentrant && criticalDepth > 0) return task()
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject })
      drain()
    })
  }

  return { enqueueCritical }
}

async function runScenario(name, reentrant) {
  const { enqueueCritical } = makeQueue({ reentrant })
  const result = await Promise.race([
    enqueueCritical(async () => {
      await enqueueCritical(async () => 'inner')
      return 'outer'
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DEADLOCK')), 300)
    ),
  ])
  console.log(`✓ ${name}:`, result)
}

try {
  await runScenario('reentrant (fixed)', true)
} catch (e) {
  console.log('✗ reentrant:', e.message)
  process.exit(1)
}

try {
  await runScenario('non-reentrant (old bug)', false)
  console.log('✗ expected deadlock did not occur')
  process.exit(1)
} catch {
  console.log('✓ non-reentrant: DEADLOCK as expected (GameControls pause hang)')
}

console.log('OK')
