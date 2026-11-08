import type { AnimalTrack } from '../types'
import { generateSpermWhaleTrack } from './syntheticTrack'

export function loadTrack(): AnimalTrack {
  return generateSpermWhaleTrack()
}
