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

  // -----------------------------
  // Middle wall parameters
  // -----------------------------
  const MID_WALL_X = Math.floor(sx / 2);

  const DOOR_HEIGHT = 6;
  const DOOR_WIDTH  = 3;

  const doorYmin = 1;
  const doorYmax = doorYmin + DOOR_HEIGHT - 1;

  // Door centered vertically in Z, but only in LEFT HALF of the wall
  const doorZcenter = Math.floor(sz / 4); // left half (instead of sz/2)

  const doorZmin = doorZcenter - Math.floor(DOOR_WIDTH / 2);
  const doorZmax = doorZmin + DOOR_WIDTH - 1;

  // -----------------------------
  // Right-room secondary wall
  // -----------------------------
  // Wall runs along x direction at some z coordinate inside right room
  const RIGHT_ROOM_WALL_Z = Math.floor(sz * 0.65); // choose a point in the right room

  const DOOR2_WIDTH  = 3;
  const DOOR2_HEIGHT = 6;

  const door2Ymin = 1;
  const door2Ymax = door2Ymin + DOOR2_HEIGHT - 1;

  const door2Xcenter = Math.floor(MID_WALL_X + (sx - MID_WALL_X) / 2);
  const door2Xmin = door2Xcenter - Math.floor(DOOR2_WIDTH / 2);
  const door2Xmax = door2Xmin + DOOR2_WIDTH - 1;

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

    // -----------------
    // Middle vertical wall
    // -----------------
    let isMiddleWall = false;
    if (x === MID_WALL_X) {
      const inDoorY = (y >= doorYmin && y <= doorYmax);
      const inDoorZ = (z >= doorZmin && z <= doorZmax);

      if (!(inDoorY && inDoorZ)) {
        isMiddleWall = true;
      }
    }

    // -----------------
    // Secondary wall in right room
    // -----------------
    let isRightRoomWall = false;
    if (z === RIGHT_ROOM_WALL_Z && x > MID_WALL_X) {
      const inDoor2Y = (y >= door2Ymin && y <= door2Ymax);
      const inDoor2X = (x >= door2Xmin && x <= door2Xmax);

      if (!(inDoor2Y && inDoor2X)) {
        isRightRoomWall = true;
      }
    }

    // -----------------
    // Apply voxel content
    // -----------------
    if (isFloor || isCeiling || isOuterWall || isMiddleWall || isRightRoomWall) {
      setVoxelCell(voxelData, cellID, RoomBlock.WALL);
    } else {
      setVoxelCell(voxelData, cellID, RoomBlock.AIR);
    }
  }

  return voxelData;
}

