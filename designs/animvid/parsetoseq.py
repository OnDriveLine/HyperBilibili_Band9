# 转换视频为序列帧
# 需要安装opencv

import cv2
import os

def video_to_frames(video_path, output_folder, prefix):
    # 创建输出文件夹
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    # 打开视频文件
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"无法打开视频文件: {video_path}")
        return

    frame_count = 0
    while True:
        # 读取一帧
        ret, frame = cap.read()
        if not ret:
            break

        # 构建输出文件名
        frame_count += 1
        output_file = os.path.join(output_folder, f"{prefix}-{frame_count}.png")

        # 保存帧为PNG图像
        cv2.imwrite(output_file, frame)

    # 释放视频文件
    cap.release()
    print(f"视频帧已成功保存到: {output_folder}")

# 使用示例
video_path = 'splashv0.mp4'  # 视频文件路径
output_folder = './'  # 输出文件夹
prefix = 'splash'  # 自定义命名前缀

video_to_frames(video_path, output_folder, prefix)