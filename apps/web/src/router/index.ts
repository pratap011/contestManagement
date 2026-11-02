import { createRouter, createWebHistory } from 'vue-router'
import { useJourneyStore } from '@/stores/journey'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { title: 'Plan a journey' },
    },
    {
      path: '/review',
      name: 'review',
      component: () => import('@/views/FlightReviewView.vue'),
      meta: { title: 'Review flights' },
    },
    {
      path: '/map',
      name: 'map',
      component: () => import('@/views/MapView.vue'),
      meta: { title: 'Airport map' },
    },
    {
      path: '/journey',
      name: 'journey',
      component: () => import('@/views/JourneyView.vue'),
      meta: { title: 'Journey assistant' },
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('@/views/AccountView.vue'),
      meta: { title: 'Account' },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue'),
      meta: { title: 'Data and privacy' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const store = useJourneyStore()
  if (to.name === 'map' || to.name === 'journey') {
    if (!store.hasConfirmedJourney) return { name: 'home' }
  }
  if (to.name === 'review' && !store.search && !store.hasConfirmedJourney) {
    return { name: 'home' }
  }
  return true
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : 'Airport journey planner'
  document.title = `${title} · BLR Navigator`
})

export default router
