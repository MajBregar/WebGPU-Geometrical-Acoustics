
export function generateRoom(room_dimensions, materials) {
    const sx = room_dimensions[0];
    const sy = room_dimensions[1];
    const sz = room_dimensions[2];

    const MATERIAL_AIR = 0;
    let MATERIAL_WALL = -1;
    for (let i = 1; i < materials.length; i++) {
        MATERIAL_WALL = i;
        break;
    }

    if (MATERIAL_WALL === -1) {
        throw new Error("No non-air material available for walls");
    }

    const voxelData = new Uint32Array(sx * sy * sz);

    function idx(x, y, z) {
        return (z * sy * sx) + (y * sx) + x;
    }

    const MID_WALL_X = Math.floor(sx / 2);

    const DOOR_HEIGHT = 6;
    const DOOR_WIDTH  = 3;

    const doorYmin = 1;
    const doorYmax = doorYmin + DOOR_HEIGHT - 1;

    const doorZcenter = Math.floor(sz / 4);
    const doorZmin = doorZcenter - Math.floor(DOOR_WIDTH / 2);
    const doorZmax = doorZmin + DOOR_WIDTH - 1;

    const RIGHT_ROOM_WALL_Z = Math.floor(sz * 0.65);

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

        let isMiddleWall = false;
        if (x === MID_WALL_X) {
            const inDoorY = (y >= doorYmin && y <= doorYmax);
            const inDoorZ = (z >= doorZmin && z <= doorZmax);
            if (!(inDoorY && inDoorZ)) isMiddleWall = true;
        }

        let isRightRoomWall = false;
        if (z === RIGHT_ROOM_WALL_Z && x > MID_WALL_X) {
            const inDoor2Y = (y >= door2Ymin && y <= door2Ymax);
            const inDoor2X = (x >= door2Xmin && x <= door2Xmax);
            if (!(inDoor2Y && inDoor2X)) isRightRoomWall = true;
        }

        voxelData[cellID] =
            (isFloor ||
             isCeiling ||
             isOuterWall ||
             isMiddleWall ||
             isRightRoomWall)
            ? MATERIAL_WALL
            : MATERIAL_AIR;
    }

    return voxelData;
}
