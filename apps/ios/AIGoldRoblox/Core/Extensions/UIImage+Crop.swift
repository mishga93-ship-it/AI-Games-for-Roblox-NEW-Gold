//
//  UIImage+Crop.swift
//  AIGoldRoblox
//

import UIKit

extension UIImage {
    func crop(rect: CGRect) -> UIImage? {
        let scale = self.scale
        let scaledRect = CGRect(
            x: rect.origin.x * scale,
            y: rect.origin.y * scale,
            width: rect.size.width * scale,
            height: rect.size.height * scale
        )
        guard let cgImage = self.cgImage,
              let croppedCGImage = cgImage.cropping(to: scaledRect) else { return nil }
        return UIImage(cgImage: croppedCGImage, scale: scale, orientation: imageOrientation)
    }

    /// Slices a standard Roblox clothing template into broad logical regions
    /// so a merged FBX mesh can receive torso/arm/leg textures by material name.
    func sliceForRobloxTemplate() -> (torso: UIImage?, arm: UIImage?, leg: UIImage?) {
        guard let cgImage = self.cgImage else { return (nil, nil, nil) }

        let w = CGFloat(cgImage.width)
        let h = CGFloat(cgImage.height)

        // Roblox classic clothing template is usually ~585x559.
        // These ratios target the broad front/body regions and are intentionally
        // slightly conservative to avoid bleeding too much into neighboring islands.
        let torsoRect = CGRect(x: w * 0.39, y: h * 0.13, width: w * 0.22, height: h * 0.22)
        let armRect = CGRect(x: w * 0.27, y: h * 0.13, width: w * 0.11, height: h * 0.22)
        let legRect = CGRect(x: w * 0.39, y: h * 0.55, width: w * 0.22, height: h * 0.22)

        let torso = cgImage.cropping(to: torsoRect.integral).map {
            UIImage(cgImage: $0, scale: scale, orientation: imageOrientation)
        }
        let arm = cgImage.cropping(to: armRect.integral).map {
            UIImage(cgImage: $0, scale: scale, orientation: imageOrientation)
        }
        let leg = cgImage.cropping(to: legRect.integral).map {
            UIImage(cgImage: $0, scale: scale, orientation: imageOrientation)
        }

        return (torso, arm, leg)
    }
}
