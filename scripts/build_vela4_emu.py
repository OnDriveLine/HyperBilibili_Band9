import os
import buildtools

DESIGN_WIDTH = 466

buildtools.setManifestDesignWidth(DESIGN_WIDTH)
buildtools.writeBuildInfo()

os.system("aiot server --watch --open-nuttx --enable-custom-component true --enable-protobuf true")