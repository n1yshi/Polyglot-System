{
  "targets": [
    {
      "target_name": "native_module",
      "sources": [
        "cpp-module/src/main.cpp",
        "cpp-module/src/crypto.cpp",
        "cpp-module/src/matrix.cpp",
        "cpp-module/src/neural_network.cpp",
        "cpp-module/src/compression.cpp"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
        "cpp-module/include",
        "/usr/include/eigen3",
        "/usr/local/include/opencv4"
      ],
      "libraries": [
        "-lopencv_core",
        "-lopencv_imgproc",
        "-lopencv_highgui",
        "-lssl",
        "-lcrypto",
        "-lz",
        "-lpthread"
      ],
      "cflags_cc": [
        "-std=c++17",
        "-O3",
        "-march=native",
        "-fopenmp"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ]
    }
  ]
}