export const RoomBlock = Object.freeze({
  AIR: Object.freeze({
    rgba: [255, 255, 255, 0],
    physical_properties: []
  }),
  WALL: Object.freeze({
    rgba: [123, 126, 138, 255],
    physical_properties: []
  })
});

export const MATERIAL_COEFFICIENTS = {
  AIR:   0.0,
  WALL:  0.3
};


function setVoxelCell(voxedArray, cellID, type) {
  voxedArray[cellID + 0] = type.rgba[0];
  voxedArray[cellID + 1] = type.rgba[1];
  voxedArray[cellID + 2] = type.rgba[2];
  voxedArray[cellID + 3] = type.rgba[3];
}

export function generateRoom(room_dimensions) {
  const sx = room_dimensions[0];
  const sy = room_dimensions[1];
  const sz = room_dimensions[2];

  const voxelData = new Uint8Array(sx * sy * sz * 4);

  function idx(x, y, z) {
    return (z * sy * sx + y * sx + x) * 4;
  }

  const MID_WALL_X = Math.floor(sx / 2);

  for (let z = 0; z < sz; z++)
  for (let y = 0; y < sy; y++)
  for (let x = 0; x < sx; x++) {

    const cellID = idx(x, y, z);

    const isFloor   = (y === 0);
    const isCeiling = (y === sy - 1);

    const isOuterWall =
      (x === 0) ||
      (z === 0) ||
      (z === sz - 1) ||
      (x === sx - 1);

    const isMiddleWall = (x === MID_WALL_X);

    if (isFloor) {
      setVoxelCell(voxelData, cellID, RoomBlock.WALL);
      continue;
    }

    if (isCeiling) {
      setVoxelCell(voxelData, cellID, RoomBlock.WALL);
      continue;
    }

    if (isOuterWall) {
      setVoxelCell(voxelData, cellID, RoomBlock.WALL);
      continue;
    }

    if (isMiddleWall) {
      setVoxelCell(voxelData, cellID, RoomBlock.WALL);
      continue;
    }

    setVoxelCell(voxelData, cellID, RoomBlock.AIR);
  }

  return voxelData;
}


export function hideWalls(voxel_data, hide_walls_flags, room_dimensions) {
    const sx = room_dimensions[0];
    const sy = room_dimensions[1];
    const sz = room_dimensions[2];

    const filtered_data = new Uint8Array(voxel_data);

    function idx(x, y, z) {
        return (z * sy * sx + y * sx + x) * 4;
    }

    const hideTop   = hide_walls_flags.top;
    const hideNorth = hide_walls_flags.north;
    const hideSouth = hide_walls_flags.south;
    const hideEast  = hide_walls_flags.east;
    const hideWest  = hide_walls_flags.west;

    for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
    for (let x = 0; x < sx; x++) {

        const id = idx(x, y, z);

        const alpha = voxel_data[id + 3];
        if (alpha === 0) continue;

        if (hideTop && y === sy - 1) {
            filtered_data[id + 3] = 0;
            continue;
        }

        if (hideNorth && z === 0) {
            filtered_data[id + 3] = 0;
            continue;
        }

        if (hideSouth && z === sz - 1) {
            filtered_data[id + 3] = 0;
            continue;
        }

        if (hideWest && x === 0) {
            filtered_data[id + 3] = 0;
            continue;
        }

        if (hideEast && x === sx - 1) {
            filtered_data[id + 3] = 0;
            continue;
        }
    }

    return filtered_data;
}
