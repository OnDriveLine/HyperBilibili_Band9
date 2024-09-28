import json
import subprocess
from datetime import datetime

def writeBuildInfo():
    f = open("src/buildinfo.ts", "r")
    f = f.read()

    print(f)
    out = f.replace("SCRIPT_REPLACE_GIT_COMMIT", getGitCommitHash())
    out = out.replace("SCRIPT_REPLACE_BUILD_TIME", getBuildTime())
    
    f = open("src/buildinfo.ts", "w+")
    f.write(out)
    f.close()

    print("Build info writed.")

def setManifestDesignWidth(width):
    manifest = readFileToJson("src/manifest.json")
    manifest["config"]["designWidth"] = width
    writeJsonToFile("src/manifest.json", manifest)

def getGitCommitHash():
    try:
        result = subprocess.run(['git', 'rev-parse', 'HEAD'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0:
            commit_hash = result.stdout.strip()[:7]
            return commit_hash
        else:
            print("Failed to get commit hash. Make sure you are in a Git repository.")
            Exception(f"Error: {result.stderr}")
    except Exception as e:
        print(f"An error occurred: {e}")

def getBuildTime():
    now = datetime.now()
    formatted_datetime = now.strftime("%Y.%m.%d %H:%M")
    return formatted_datetime

def readFileToJson(path):
    f = open(path, "r")
    f = f.read()
    f = json.loads(f)
    return f

def writeJsonToFile(path, obj):
    f = open(path, "w+")
    write_str = json.dumps(obj)
    f.write(write_str)
    f.close()